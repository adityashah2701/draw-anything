import type { AIModelProvider } from "@/features/ai/types";
import type { ToolGroup } from "../types";
import type { CanvasMessage, CanvasTurn } from "./types";

export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentRequestError";
  }
}

export interface TurnClientOptions {
  whiteboardId: string;
  provider?: AIModelProvider;
  /** A listed NVIDIA model (see NVIDIA_MODELS); sent only with provider "nvidia". */
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Asks for a streamed reply and receives its text as the model writes it. */
  onDelta?: (text: string) => void;
}

const FRIENDLY: Record<number, string> = {
  401: "Sign in to use the assistant.",
  403: "You do not have access to this whiteboard.",
  413: "This conversation is too long. Start a new one.",
  429: "Too many requests. Please wait a moment and try again.",
};

/** Reads an NDJSON turn: text deltas go to `onDelta`, the last line is the turn or an error. */
const readStream = async (body: ReadableStream<Uint8Array>, onDelta?: (text: string) => void): Promise<CanvasTurn | null> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let turn: CanvasTurn | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    const value = JSON.parse(line) as { d?: unknown; turn?: CanvasTurn; error?: unknown; status?: number };
    if (typeof value.d === "string") onDelta?.(value.d);
    else if (value.turn) turn = value.turn;
    else if (value.error !== undefined) throw new AgentRequestError(typeof value.error === "string" ? value.error : "The assistant could not complete this step.", value.status ?? 502);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(buffer);
  return turn;
};

/** Posts one conversation to the turn endpoint and returns the model's reply; failures carry a message safe to show. */
export const createTurnClient =
  ({ whiteboardId, provider, model, endpoint = "/api/ai/canvas-agent", fetchImpl = fetch, signal, onDelta }: TurnClientOptions) =>
  async (input: { messages: CanvasMessage[]; enabledGroups: ToolGroup[] }): Promise<CanvasTurn> => {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whiteboardId, ...(provider ? { provider } : {}), ...(provider === "nvidia" && model ? { model } : {}), messages: input.messages, enabledGroups: input.enabledGroups, ...(onDelta ? { stream: true } : {}) }),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new AgentRequestError("The assistant could not be reached. Check your connection and try again.", 0);
    }
    if (!response.ok) {
      let message = FRIENDLY[response.status];
      if (!message) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        message = typeof body?.error === "string" ? body.error : "The assistant could not complete this step.";
      }
      throw new AgentRequestError(message, response.status);
    }
    const turn = response.headers.get("Content-Type")?.includes("ndjson") && response.body ? await readStream(response.body, onDelta) : ((await response.json().catch(() => null)) as CanvasTurn | null);
    if (!turn || typeof turn.text !== "string" || !Array.isArray(turn.calls)) throw new AgentRequestError("The assistant sent a reply that could not be read.", 502);
    // Display-only fields are read defensively: a malformed one is dropped, never trusted.
    if (typeof turn.thinking !== "string") delete turn.thinking;
    if (typeof turn.notice !== "string") delete turn.notice;
    return turn;
  };

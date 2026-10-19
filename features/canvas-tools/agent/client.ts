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
}

const FRIENDLY: Record<number, string> = {
  401: "Sign in to use the assistant.",
  403: "You do not have access to this whiteboard.",
  413: "This conversation is too long. Start a new one.",
  429: "Too many requests. Please wait a moment and try again.",
};

/** Posts one conversation to the turn endpoint and returns the model's reply; failures carry a message safe to show. */
export const createTurnClient =
  ({ whiteboardId, provider, model, endpoint = "/api/ai/canvas-agent", fetchImpl = fetch, signal }: TurnClientOptions) =>
  async (input: { messages: CanvasMessage[]; enabledGroups: ToolGroup[] }): Promise<CanvasTurn> => {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whiteboardId, ...(provider ? { provider } : {}), ...(provider === "nvidia" && model ? { model } : {}), messages: input.messages, enabledGroups: input.enabledGroups }),
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
    const turn = (await response.json().catch(() => null)) as CanvasTurn | null;
    if (!turn || typeof turn.text !== "string" || !Array.isArray(turn.calls)) throw new AgentRequestError("The assistant sent a reply that could not be read.", 502);
    return turn;
  };

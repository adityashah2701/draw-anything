import type { AIModelProvider, AIStreamEvent } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { GenerateOutcome } from "../types";

export interface GenerateClientOptions {
  whiteboardId: string;
  provider?: AIModelProvider;
  description: string;
  diagramType?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** What the generator is doing now, for the panel: a phase, a note, how many elements have been drawn. */
  onProgress?: (text: string) => void;
  /** The generator's own reasoning notes, as they arrive. */
  onThinking?: (text: string) => void;
  /** Longest wait with nothing at all from the generator (ms). */
  idleMs?: number;
  /** Longest a whole generation may take (ms). */
  totalMs?: number;
}

export const GENERATE_IDLE_MS = 2 * 60_000;
export const GENERATE_TOTAL_MS = 10 * 60_000;

const FRIENDLY: Record<number, string> = {
  401: "Sign in to generate diagrams.",
  403: "You do not have access to this whiteboard.",
  429: "Too many diagram requests. Please wait a few minutes.",
};

/**
 * Runs the existing diagram generator (`/api/ai/generate-diagram`, which streams) and returns the elements it
 * produced without touching the board: the generate_diagram tool places them as one undoable patch. Elements that
 * the stream later updates or removes (a re-route, a pruned node) are folded in, so the result is the final set.
 */
export const generateElements = async (options: GenerateClientOptions): Promise<GenerateOutcome> => {
  const { signal, idleMs = GENERATE_IDLE_MS, totalMs = GENERATE_TOTAL_MS } = options;
  // One signal for the request: the person's Stop, or one of the two time limits, each with its own reason.
  const guard = new AbortController();
  let timedOut: string | undefined;
  const span = (ms: number) => (ms >= 120_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.max(1, Math.round(ms / 1000))} seconds`);
  const expire = (message: string) => {
    timedOut = message;
    guard.abort(new Error(message));
  };
  const onStop = () => guard.abort(signal?.reason ?? new DOMException("Stopped.", "AbortError"));
  if (signal?.aborted) onStop();
  else signal?.addEventListener("abort", onStop, { once: true });
  const total = setTimeout(() => expire(`The generator was still working after ${span(totalMs)}, so it was stopped. Nothing was added. Try a smaller diagram or a faster model.`), totalMs);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const alive = () => {
    clearTimeout(idle);
    idle = setTimeout(() => expire(`The model gave no sign of progress for ${span(idleMs)}, so the generator was stopped. Nothing was added. Try again or pick another model.`), idleMs);
  };
  alive();
  try {
    return await readGeneration({ ...options, signal: guard.signal }, alive);
  } catch (error) {
    if (timedOut) throw new Error(timedOut);
    throw error;
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
    signal?.removeEventListener("abort", onStop);
  }
};

const readGeneration = async ({ whiteboardId, provider, description, diagramType, signal, fetchImpl = fetch, onProgress, onThinking }: GenerateClientOptions, alive: () => void): Promise<GenerateOutcome> => {
  const prompt = diagramType ? `${description}\n\nDiagram type: ${diagramType}.` : description;
  const response = await fetchImpl("/api/ai/generate-diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...(provider ? { model: provider, provider } : {}), whiteboardId }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(FRIENDLY[response.status] ?? (typeof body?.error === "string" ? body.error : "The diagram could not be generated."));
  }
  if (!response.body) throw new Error("The generator sent no response.");

  const elements = new Map<string, DrawingElement>();
  const warnings: string[] = [];
  let finished = false;

  const handle = (event: AIStreamEvent) => {
    switch (event.type) {
      case "phase.started":
        onProgress?.(event.message);
        break;
      case "agent.note":
        onProgress?.(event.note.title);
        if (event.note.kind === "reasoning" && event.note.text?.trim()) onThinking?.(event.note.text);
        break;
      case "element.batch":
        for (const el of event.elements) elements.set(el.id, el);
        onProgress?.(`Drawing the diagram: ${elements.size} elements so far`);
        break;
      case "element.update":
        for (const el of event.elements) if (elements.has(el.id)) elements.set(el.id, el);
        break;
      case "element.remove":
        for (const id of event.elementIds) elements.delete(id);
        break;
      case "validation.report":
        if (!event.report.valid) warnings.push(`The diagram check found ${event.report.issues.length} issue(s).`);
        break;
      case "frame.error":
        throw new Error(event.message || "The diagram could not be generated.");
      case "frame.done":
        finished = true;
        break;
    }
  };

  const reader = response.body.getReader();
  // A stream that is not tied to the request's signal (or a proxy that holds the connection) must still end on Stop or a time limit.
  const release = () => void reader.cancel().catch(() => undefined);
  if (signal?.aborted) release();
  else signal?.addEventListener("abort", release, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    alive();
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const json = part.slice(6).trim();
      if (!json) continue;
      let event: AIStreamEvent;
      try {
        event = JSON.parse(json) as AIStreamEvent;
      } catch {
        continue;
      }
      handle(event);
    }
  }
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException("Stopped.", "AbortError");
  if (!finished) throw new Error("The generator stopped before it finished, so nothing was added.");
  return { elements: [...elements.values()], warnings };
};

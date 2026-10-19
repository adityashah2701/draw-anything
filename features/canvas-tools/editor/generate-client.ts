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
}

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
export const generateElements = async ({ whiteboardId, provider, description, diagramType, signal, fetchImpl = fetch }: GenerateClientOptions): Promise<GenerateOutcome> => {
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
      case "element.batch":
        for (const el of event.elements) elements.set(el.id, el);
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
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
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
  if (!finished) throw new Error("The generator stopped before it finished, so nothing was added.");
  return { elements: [...elements.values()], warnings };
};

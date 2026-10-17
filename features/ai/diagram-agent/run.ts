import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { phaseCompleted, phaseStarted } from "@/features/ai/server/agents/types";
import { createInitialAIFrame } from "@/features/ai/server/workflow";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import type { AIGenerateDiagramRequest, AIModelProvider, AIStreamEvent } from "@/features/ai/types";
import { runDiagramAgent, type AgentProgress } from "./agent-loop";
import { inferDiagramType } from "./prompt/prompt-context";
import { buildSystemPrompt, buildUserPrompt } from "./prompt/system";
import { createToolTransport } from "./transports/create";
import type { ToolTransport } from "./types";

export interface DiagramAgentOptions {
  request: AIGenerateDiagramRequest;
  /** Injected in tests; in production built from the request's provider. */
  transport?: ToolTransport;
  /** Existing diagram on the canvas, as diagram code, for edit requests. */
  existingDiagram?: string;
  maxTurns?: number;
}

export const createGenerationId = () => `ai_gen_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

/**
 * Runs `work` while yielding the events it emits as they happen, then returns its result. This is
 * what lets "searching icons", "reviewing layout" reach the client during the model's turns
 * instead of after them.
 */
export async function* withLiveEvents<T>(work: (emit: (event: AIStreamEvent) => void) => Promise<T>): AsyncGenerator<AIStreamEvent, T> {
  const queue: AIStreamEvent[] = [];
  let wake: (() => void) | undefined;
  let done = false;
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
  const promise = work((event) => {
    queue.push(event);
    wake?.();
  }).then(
    (value) => (outcome = { ok: true, value }),
    (error) => (outcome = { ok: false, error }),
  ).finally(() => {
    done = true;
    wake?.();
  });
  while (!done || queue.length > 0) {
    if (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
    wake = undefined;
    while (queue.length > 0) yield queue.shift()!;
  }
  await promise;
  if (!outcome || !outcome.ok) throw outcome ? outcome.error : new Error("Diagram agent produced no result");
  return outcome.value;
}

/**
 * The agent pipeline behind the same event contract as the legacy workflow:
 * frame.created -> phase events -> element.batch -> frame.done (or a thrown error, which the HTTP
 * handler turns into frame.error). The client needs no change.
 */
export async function* streamDiagramAgentEvents(options: DiagramAgentOptions): AsyncGenerator<AIStreamEvent> {
  const { request } = options;
  const provider: AIModelProvider = request.provider ?? request.model ?? "gemini";
  const frame = createInitialAIFrame(request);
  const frameId = frame.frameId;
  const controller = new AbortController();

  try {
    yield { type: "frame.created", frame };
    yield phaseStarted(frameId, "contextRetriever", "Reading your request");
    yield phaseCompleted(frameId, "contextRetriever", "Request understood");
    yield phaseStarted(frameId, "architecturePlanner", "Designing the diagram");

    const transport = options.transport ?? createToolTransport(provider, (n) => {
      console.warn(`[diagramAgent] ${frameId}: ${n.from} tool calling failed, using ${n.to} (${n.reason})`);
    });

    const result = yield* withLiveEvents(async (emit) =>
      runDiagramAgent({
        transport,
        system: buildSystemPrompt(transport.kind, {
          diagramType: inferDiagramType(request.prompt, options.existingDiagram),
          prompt: request.prompt,
        }),
        user: buildUserPrompt(request.prompt, options.existingDiagram),
        maxTurns: options.maxTurns,
        signal: controller.signal,
        onProgress: (p: AgentProgress) => {
          if (p.type !== "tool") return;
          if (p.name === "check_diagram") emit(phaseStarted(frameId, "validationAgent", "Checking layout and design"));
          else if (p.name === "search_icons") emit(phaseStarted(frameId, "architecturePlanner", "Choosing icons"));
        },
      }),
    );

    const parsed = parseDiagramCode(result.code);
    const { document } = documentFromParsedCode(parsed, createGenerationId(), {
      prompt: request.prompt,
      provider,
      modelName: provider,
    });
    yield phaseCompleted(frameId, "architecturePlanner", `Designed ${document.nodes.length} components`);

    yield phaseStarted(frameId, "canvasCompiler", "Laying out and drawing");
    const compiled = compileAIDiagramDetailed(document, frameId);
    const { collidingLabels, droppedGroups, unfittedNodes, layoutFallback } = compiled.diagnostics;
    if (process.env.NODE_ENV !== "test") {
      // Ids and counts only: nothing from the prompt or the diagram text is logged.
      console.info(
        `[diagramAgent] ${frameId}: provider=${provider} transport=${result.transport} turns=${result.turns} finished=${result.finished} tools=${result.toolTrail.join(",")} nodes=${document.nodes.length} collidingLabels=${collidingLabels.length} droppedGroups=${droppedGroups.length} unfitted=${unfittedNodes.length} fallback=${Boolean(layoutFallback)}`,
      );
    }
    yield { type: "element.batch", frameId, elements: compiled.elements };
    yield phaseCompleted(frameId, "canvasCompiler", `Drew ${compiled.elements.length} elements`);
    yield { type: "frame.done", frameId, count: compiled.elements.length, graph: document };
  } finally {
    // The consumer stopped (client cancelled) or we finished: no further provider calls.
    controller.abort();
  }
}

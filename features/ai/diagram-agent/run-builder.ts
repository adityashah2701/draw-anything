import { phaseCompleted, phaseStarted } from "@/features/ai/server/agents/types";
import { createInitialAIFrame } from "@/features/ai/server/workflow";
import type { AIGenerateDiagramRequest, AIModelProvider, AIStreamEvent, AIWorkflowPhase } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { runDiagramBuilder, type BuilderStep } from "./builder/loop";
import { BUILDER_TOOL_SPECS, buildBuilderSystemPrompt } from "./builder/prompt";
import { inferDiagramType } from "./prompt/prompt-context";
import { createGenerationId, withLiveEvents } from "./run";
import { createToolTransport, supportsVision } from "./transports/create";
import type { ToolTransport } from "./types";

export interface DiagramBuilderOptions {
  request: AIGenerateDiagramRequest;
  /** Injected in tests; in production built from the request's provider. */
  transport?: ToolTransport;
  maxTurns?: number;
  /** Renders the canvas to a PNG data URL; given in tests, built from `AI_VISION` in production. */
  renderImage?: (elements: DrawingElement[]) => Promise<string | undefined>;
}

const PHASE: Record<BuilderStep["kind"], AIWorkflowPhase> = {
  add: "diagramComposer",
  adjust: "repairAgent",
  icons: "architecturePlanner",
  view: "validationAgent",
  review: "criticAgent",
};

const visionRequested = (env: Record<string, string | undefined> = process.env) => /^(1|true|on)$/i.test(env.AI_VISION?.trim() ?? "");

/**
 * The builder agent behind the same event contract as the other pipelines, plus `element.update` and
 * `element.remove`: the canvas is drawn while the model works, one step at a time, and later steps
 * adjust what is already there. The client draws each event as it arrives.
 */
export async function* streamDiagramBuilderEvents(options: DiagramBuilderOptions): AsyncGenerator<AIStreamEvent> {
  const { request } = options;
  const provider: AIModelProvider = request.provider ?? request.model ?? "gemini";
  const frame = createInitialAIFrame(request);
  const frameId = frame.frameId;
  const generationId = createGenerationId();
  const controller = new AbortController();

  try {
    yield { type: "frame.created", frame };
    yield phaseStarted(frameId, "contextRetriever", "Reading your request");
    yield phaseCompleted(frameId, "contextRetriever", "Request understood");
    yield phaseStarted(frameId, "diagramComposer", "Building the diagram step by step");

    const vision = visionRequested() && supportsVision(provider);
    const transport =
      options.transport ??
      createToolTransport(
        provider,
        (n) => console.warn(`[diagramBuilder] ${frameId}: ${n.from} tool calling failed, using ${n.to} (${n.reason})`),
        process.env,
        { tools: BUILDER_TOOL_SPECS, vision },
      );
    const renderImage =
      options.renderImage ?? (vision ? async (elements: DrawingElement[]) => (await import("./builder/render-png")).renderCanvasPng(elements) : undefined);

    const result = yield* withLiveEvents(async (emit) =>
      runDiagramBuilder({
        transport,
        system: buildBuilderSystemPrompt(transport.kind, {
          diagramType: inferDiagramType(request.prompt),
          prompt: request.prompt,
          vision: Boolean(renderImage),
        }),
        goal: request.prompt,
        generationId,
        frameId,
        maxTurns: options.maxTurns ?? (Number(process.env.AI_BUILDER_MAX_TURNS) || undefined),
        renderImage,
        signal: controller.signal,
        onCanvas: ({ added, updated, removedIds }) => {
          if (removedIds.length > 0) emit({ type: "element.remove", frameId, elementIds: removedIds });
          if (updated.length > 0) emit({ type: "element.update", frameId, elements: updated });
          if (added.length > 0) emit({ type: "element.batch", frameId, elements: added });
        },
        onStep: (step) => emit(phaseCompleted(frameId, PHASE[step.kind], step.summary)),
      }),
    );

    if (process.env.NODE_ENV !== "test") {
      // Ids and counts only: nothing from the prompt or the diagram text is logged.
      console.info(
        `[diagramBuilder] ${frameId}: provider=${provider} transport=${result.transport} vision=${vision} turns=${result.turns} reviews=${result.reviews} finished=${result.finished} tools=${result.toolTrail.join(",")} nodes=${result.state.parsed.nodes.length}`,
      );
    }
    yield phaseCompleted(
      frameId,
      "canvasCompiler",
      result.finished ? `Done: ${result.state.parsed.nodes.length} components` : `Stopped at the step limit with ${result.state.parsed.nodes.length} components; this is the best version`,
    );
    yield { type: "frame.done", frameId, count: result.built.elements.length, graph: result.built.document };
  } finally {
    controller.abort();
  }
}

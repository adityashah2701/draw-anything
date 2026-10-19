import { phaseCompleted, phaseStarted } from "@/features/ai/server/agents/types";
import { DEFAULT_AI_PROVIDER } from "@/features/ai/default-provider";
import { createInitialAIFrame } from "@/features/ai/server/workflow";
import type { AIGenerateDiagramRequest, AIModelProvider, AIStreamEvent } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { graphFromElements } from "@/features/diagram-code/canvas";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { iconHints, wantsBareIcons, wantsPlainBoxes } from "./builder/icon-hints";
import { runDiagramBuilder } from "./builder/loop";
import { noteFor, summaryNote } from "./builder/notes";
import { BUILDER_TOOL_SPECS, buildBuilderSystemPrompt } from "./builder/prompt";
import { inferDiagramType } from "./prompt/prompt-context";
import { createGenerationId, withLiveEvents } from "./run";
import { createToolTransport, supportsVision } from "./transports/create";
import type { ToolTransport } from "./types";

/** Pause between the shapes of one step, so a step with many shapes still appears one by one. `AI_REVEAL_MS` changes it. */
const DEFAULT_REVEAL_MS = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The elements of a step as the pieces the client draws one after another: each shape or connector on
 * its own (a label stays with its connector). When nothing is drawn yet, the first piece holds the
 * elements at the top-left edge: the client positions the whole diagram from its first piece.
 */
export const revealChunks = (added: DrawingElement[], first: boolean): DrawingElement[][] => {
  const chunks: DrawingElement[][] = [];
  for (const element of added) {
    const attaches = element.ai?.role === "edge-label" || element.ai?.role === "group-label";
    if (attaches && chunks.length > 0) chunks[chunks.length - 1].push(element);
    else chunks.push([element]);
  }
  if (!first || chunks.length < 2) return chunks;
  const corner = (pick: (p: { x: number; y: number }) => number) => {
    let best = 0;
    chunks.forEach((chunk, i) => {
      const value = Math.min(...chunk.flatMap((e) => e.points.map(pick)));
      if (value < Math.min(...chunks[best].flatMap((e) => e.points.map(pick)))) best = i;
    });
    return best;
  };
  const anchors = new Set([corner((p) => p.x), corner((p) => p.y)]);
  const head = [...anchors].sort((a, b) => a - b).flatMap((i) => chunks[i]);
  return [head, ...chunks.filter((_, i) => !anchors.has(i))];
};

export interface DiagramBuilderOptions {
  request: AIGenerateDiagramRequest;
  /** Injected in tests; in production built from the request's provider. */
  transport?: ToolTransport;
  maxTurns?: number;
  /** Undo an adjustment that made the picture worse (default on). */
  guardAdjustments?: boolean;
  /** Pause between shapes of one step (ms); 0 in tests. */
  revealMs?: number;
  /** Renders the canvas to a PNG data URL; given in tests, built from `AI_VISION` in production. */
  renderImage?: (elements: DrawingElement[]) => Promise<string | undefined>;
}

const visionRequested = (env: Record<string, string | undefined> = process.env) => /^(1|true|on)$/i.test(env.AI_VISION?.trim() ?? "");

/**
 * The builder agent behind the same event contract as the other pipelines, plus `element.update` and
 * `element.remove`: the canvas is drawn while the model works, one step at a time, and later steps
 * adjust what is already there. The client draws each event as it arrives.
 */
export async function* streamDiagramBuilderEvents(options: DiagramBuilderOptions): AsyncGenerator<AIStreamEvent> {
  const { request } = options;
  const provider: AIModelProvider = request.provider ?? request.model ?? DEFAULT_AI_PROVIDER;
  const frame = createInitialAIFrame(request);
  const frameId = frame.frameId;
  const generationId = createGenerationId();
  const controller = new AbortController();

  try {
    yield { type: "frame.created", frame };
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

    // Edit mode: the diagram on the board becomes the starting point, and its elements are replaced by the edited drawing.
    const existing = request.edit ? graphFromElements(request.canvasContext?.elements ?? []) : undefined;
    const editing = existing !== undefined && existing.graph.nodes.length > 0;
    let pendingRemoval: string[] | undefined = editing ? existing.consumedIds : undefined;

    const hints = await iconHints(request.prompt);
    const bareIcons = wantsBareIcons(request.prompt);
    const plainBoxes = wantsPlainBoxes(request.prompt);
    const revealMs = options.revealMs ?? (Number(process.env.AI_REVEAL_MS ?? DEFAULT_REVEAL_MS) || 0);
    let drawnAnything = false;
    const result = yield* withLiveEvents(async (emit) =>
      runDiagramBuilder({
        transport,
        system: buildBuilderSystemPrompt(transport.kind, {
          diagramType: inferDiagramType(request.prompt),
          prompt: request.prompt,
          vision: Boolean(renderImage),
          editing,
          iconHints: hints,
          bareIcons,
          plainBoxes,
        }),
        goal: editing ? `Change the diagram that is already on the canvas: ${request.prompt}` : request.prompt,
        bareIcons,
        iconPriority: !bareIcons && !plainBoxes && !editing,
        initialCode: editing ? serializeDiagramCode(existing.graph) : undefined,
        generationId,
        frameId,
        guardAdjustments: options.guardAdjustments,
        maxMs:
          process.env.AI_BUILDER_MAX_MS !== undefined
            ? (Number(process.env.AI_BUILDER_MAX_MS) === 0 || /^(none|unlimited|infinity)$/i.test(process.env.AI_BUILDER_MAX_MS.trim())
                ? Infinity
                : Number(process.env.AI_BUILDER_MAX_MS) || undefined)
            : (provider === "nvidia" ? Infinity : undefined),
        renderImage,
        signal: controller.signal,
        onCanvas: async ({ added, updated, removedIds }) => {
          // Just before the first drawing, so a failure earlier leaves the person's diagram alone.
          if (pendingRemoval) {
            if (pendingRemoval.length > 0) emit({ type: "element.remove", frameId, elementIds: pendingRemoval });
            pendingRemoval = undefined;
          }
          if (removedIds.length > 0) emit({ type: "element.remove", frameId, elementIds: removedIds });
          if (updated.length > 0) emit({ type: "element.update", frameId, elements: updated });
          const chunks = revealChunks(added, !drawnAnything);
          // Redrawing what was already there is not shown shape by shape.
          const pace = editing && !drawnAnything ? 0 : revealMs;
          if (added.length > 0) drawnAnything = true;
          for (let i = 0; i < chunks.length; i += 1) {
            emit({ type: "element.batch", frameId, elements: chunks[i] });
            if (pace > 0 && i < chunks.length - 1) await sleep(pace);
          }
        },
        onNote: (note) => emit({ type: "agent.note", frameId, note: noteFor(note) }),
      }),
    );

    if (process.env.NODE_ENV !== "test") {
      // Ids and counts only: nothing from the prompt or the diagram text is logged.
      console.info(
        `[diagramBuilder] ${frameId}: provider=${provider} transport=${result.transport} vision=${vision} turns=${result.turns} reviews=${result.reviews} finished=${result.finished} tools=${result.toolTrail.join(",")} nodes=${result.state.parsed.nodes.length}`,
      );
    }
    yield { type: "agent.note", frameId, note: summaryNote(result) };
    yield { type: "frame.done", frameId, count: result.built.elements.length, graph: result.built.document };
  } finally {
    controller.abort();
  }
}

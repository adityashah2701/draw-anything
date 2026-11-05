import { buildFrameIndex, frameDescendants } from "@/core/frames/frame-index";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { enforceFixed } from "@/core/layout/kit/fixed";
import { computeStats } from "@/core/layout/kit/stats";
import { freeformEngine } from "@/core/layout/engines/freeform";
import { ensureLayoutEngines } from "@/features/ai/server/layout/register-engines";
import { placementOf } from "@/core/layout/placement";
import { buildLayoutRecord, layoutFor, layoutRecordsOf } from "@/core/layout/record";
import { layoutEnginesEnabled } from "@/core/layout/flags";
import { algorithmOf, engineForFamily, FREEFORM_ID, getLayoutEngine } from "@/core/layout/registry";
import { PROFILES } from "@/features/ai/diagram-agent/profiles";
import type { LayoutContainer, LayoutEdge, LayoutEngine, LayoutGraph, LayoutMode, LayoutNode, LayoutResult, LayoutStats, PlacedNode } from "@/core/layout/types";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { normalizeRelation } from "@/core/shapes/arrow/relations";
import { architectureEngine } from "@/features/ai/server/layout/architecture-engine";
import type { DrawingElement, LayoutRecord } from "@/features/whiteboard/types/whiteboard.types";
import { planMoveByOffsets } from "./arrange";
import { labelOf } from "./connectors";
import type { CommandContext } from "./context";
import { isLayoutNode } from "./layout";

/**
 * Layout through the engines: a plan, never a write. `planEngineLayout` reads the board, asks an engine what it
 * would do in one of three modes, checks the answer cannot move what it must not, and returns the preview a person
 * looks at and the `DocPatch` that applies it (one undo step; the same patch for the editor, the code panel and the AI).
 */

export { ensureLayoutEngines };

export interface EngineLayoutInput {
  mode: LayoutMode;
  /** Defaults to the engine of the governing layout record, else freeform. */
  engine?: string;
  algorithm?: string;
  params?: Record<string, unknown>;
  /** The nodes to lay out (null/absent: every node of the diagram or board). */
  ids?: readonly string[] | null;
  /** Nodes that were just added: they are treated as unplaced and placed by the engine, wherever they currently are. */
  newIds?: readonly string[];
  /** Required to apply `overwrite`: the person has seen how many of their own placements it moves. */
  confirm?: boolean;
  /** Store the engine and algorithm as the board's layout record when the plan is applied. */
  remember?: boolean;
  /** Lay out only what a frame owns, and store the choice for that frame: a frame can have its own engine inside a diagram laid out by another. */
  frameId?: string;
}

export interface LayoutPreview {
  engine: string;
  algorithm: string;
  mode: LayoutMode;
  /** One entry per node that would move. */
  moves: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; width: number; height: number; source: "auto" | "user" }>;
  unplaced: Array<{ id: string; reason: string }>;
  stats: LayoutStats;
  warnings: string[];
  /** For `overwrite`: how many of the person's own placements it would move, and that it needs their confirmation. */
  userPlacedMoved: number;
  needsConfirmation: boolean;
  nodes: number;
}

export interface EngineLayoutPlan {
  /** Null when nothing would change, or when the mode needs a confirmation that has not been given. */
  patch: DocPatch | null;
  preview: LayoutPreview;
}

const textOf = (el: DrawingElement) => (typeof el.label === "string" && el.label.trim() !== "" ? el.label : typeof el.text === "string" ? el.text : undefined);

const shapeName = (el: DrawingElement): string | undefined =>
  el.type === "diamond" || el.type === "pill" || el.type === "icon" ? el.type : el.type === "outline" ? (el as { variant?: string }).variant : undefined;

/** The board's nodes, connections and group frames as a layout graph, and where each node is and who placed it. */
export const graphFromContext = (ctx: CommandContext, ids?: readonly string[] | null) => {
  const wanted = ids ? new Set(ids) : null;
  const nodesEls = ctx.shapes.filter((s) => isLayoutNode(s) && (!wanted || wanted.has(s.id)));
  const known = new Set(nodesEls.map((n) => n.id));
  const boundsOf = new Map(nodesEls.map((n) => [n.id, ctx.getBounds(n)]));
  const nodes: LayoutNode[] = [];
  const positions = new Map<string, PlacedNode>();
  for (const el of nodesEls) {
    const b = boundsOf.get(el.id);
    if (!b) continue;
    nodes.push({ id: el.id, width: b.width, height: b.height, label: textOf(el), kind: el.ai?.semanticKind, icon: el.ai?.icon, shape: shapeName(el) });
    const source = placementOf(el, isEffectivelyLocked(ctx.index, el.id));
    positions.set(el.id, { x: b.minX, y: b.minY, source });
  }
  const edges: LayoutEdge[] = ctx.shapes.filter(isArrowElement).flatMap((arrow) => {
    const from = arrow.startConnection?.elementId;
    const to = arrow.endConnection?.elementId;
    if (!from || !to || !known.has(from) || !known.has(to)) return [];
    const relation = normalizeRelation(arrow.relation);
    return [{ id: arrow.id, from, to, label: labelOf(ctx, arrow)?.text, ...(relation ? { relation } : {}) }];
  });
  const containers: LayoutContainer[] = [];
  for (const frame of ctx.shapes.filter((s) => s.isGuide && s.ai?.role === "group")) {
    const box = ctx.getBounds(frame);
    if (!box) continue;
    const members = nodes.filter((n) => {
      const b = boundsOf.get(n.id)!;
      return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY;
    });
    const title = ctx.shapes.find((s) => s.ai?.role === "group-label" && s.ai.semanticId === frame.ai?.semanticId);
    containers.push({ id: frame.ai?.semanticId ?? frame.id, label: title ? textOf(title) : undefined, kind: "group", members: members.map((m) => m.id) });
  }
  const diagramType = nodesEls.map((n) => n.ai?.diagramType).find(Boolean);
  const graph: LayoutGraph = { nodes, edges, containers, ...(diagramType ? { diagramType } : {}) };
  return { graph, positions, nodeElements: new Map(nodesEls.map((n) => [n.id, n])) };
};

const EMPTY_STATS: LayoutStats = { nodes: 0, moved: 0, heldFixed: 0, maxDisplacement: 0, meanDisplacement: 0, orderPreserved: 1, overlaps: 0 };

/** The diagram a set of nodes mostly belongs to (the generation id most of them share), if any. */
const diagramIdOf = (els: Iterable<DrawingElement>): string | undefined => {
  const counts = new Map<string, number>();
  for (const el of els) if (el.ai?.generationId) counts.set(el.ai.generationId, (counts.get(el.ai.generationId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
};

export const planEngineLayout = (ctx: CommandContext, input: EngineLayoutInput): EngineLayoutPlan => {
  ensureLayoutEngines();
  const frames = buildFrameIndex(ctx.shapes);
  const inFrame = input.frameId ? new Set(frameDescendants(frames, input.frameId)) : null;
  const scopeIds = inFrame ? [...inFrame].filter((id) => (input.ids ? input.ids.includes(id) : true)) : input.ids;
  const { graph, positions, nodeElements } = graphFromContext(ctx, scopeIds);
  const empty = (warnings: string[], engine = FREEFORM_ID, algorithm = "keep"): EngineLayoutPlan => ({
    patch: null,
    preview: { engine, algorithm, mode: input.mode, moves: [], unplaced: [], stats: { ...EMPTY_STATS, nodes: graph.nodes.length }, warnings, userPlacedMoved: 0, needsConfirmation: false, nodes: graph.nodes.length },
  });
  if (graph.nodes.length === 0) return empty(["There is nothing to lay out."]);

  // Which engine: the caller's choice, else the governing record's, else freeform. A mode that keeps everything needs no engine of its own.
  const records = layoutRecordsOf(ctx.stored);
  const sample = [...nodeElements.values()][0];
  const governing = layoutFor({ records, frameOf: (id) => frames.parentOf.get(id) }, sample);
  const engineId = input.engine ?? governing?.engine ?? FREEFORM_ID;
  const engine = (getLayoutEngine(engineId) ?? freeformEngine) as LayoutEngine;
  const algorithm = algorithmOf(engine, input.algorithm ?? governing?.algorithm);
  const warnings: string[] = [];
  if (engineId !== engine.id) warnings.push(`There is no "${engineId}" layout; the elements were kept as they are.`);

  // Nodes just added are unplaced: the engine puts them somewhere, wherever they happen to be now.
  const newIds = new Set(input.newIds ?? []);
  const placedPositions = new Map([...positions].filter(([id]) => !newIds.has(id)));
  const request = {
    graph,
    algorithm: algorithm.id,
    params: { ...algorithm.defaults, ...(input.params ?? {}) },
    mode: input.mode,
    positions: placedPositions,
    seed: 1,
    budget: { maxMs: 5000 },
  };

  // `preserve` moves nothing that exists, so only the freeform placement of new nodes can run.
  const runner = (input.mode === "preserve" ? freeformEngine : engine) as LayoutEngine;
  const rawResult: LayoutResult = runner.layout(request);
  const guarded = enforceFixed(request, rawResult);
  if (guarded.violations.length > 0) warnings.push(guarded.result.diagnostics.find((d) => d.code === "layout/fixed-moved")?.message ?? "A fixed element was protected.");
  const result = guarded.result;
  for (const d of engine.validate(graph)) if (d.severity !== "info") warnings.push(d.message);

  const stats = computeStats(request, result);
  const moves = [...result.positions].flatMap(([id, to]) => {
    const node = graph.nodes.find((n) => n.id === id);
    const from = positions.get(id);
    if (!node || !from) return [];
    if (from.x === to.x && from.y === to.y) return [];
    return [{ id, from: { x: from.x, y: from.y }, to, width: node.width, height: node.height, source: from.source === "user" ? ("user" as const) : ("auto" as const) }];
  });
  const userPlacedMoved = moves.filter((m) => m.source === "user" && !newIds.has(m.id)).length;
  const needsConfirmation = input.mode === "overwrite" && userPlacedMoved > 0 && input.confirm !== true;
  const preview: LayoutPreview = { engine: engine.id, algorithm: algorithm.id, mode: input.mode, moves, unplaced: result.unplaced, stats, warnings, userPlacedMoved, needsConfirmation, nodes: graph.nodes.length };
  if (needsConfirmation) return { patch: null, preview };

  // The patch: move the nodes (connectors follow through the router), then the group frames and headings the engine placed.
  const offsets = new Map(moves.map((m) => [m.id, { dx: m.to.x - m.from.x, dy: m.to.y - m.from.y }]));
  const moved = planMoveByOffsets(ctx, offsets);
  const guideUpdates: DrawingElement[] = [];
  for (const el of ctx.shapes) {
    if (!el.isGuide || !el.ai?.semanticId || (el.ai.role !== "group" && el.ai.role !== "group-label")) continue;
    const points = moves.length > 0 ? result.guides?.get(`${el.ai.role}:${el.ai.semanticId}`) : undefined;
    // Only a frame or heading that actually changes is written; when nothing moved, the group's annotations are left exactly as they are.
    if (points && points.length === el.points.length && points.some((p, i) => Math.abs(p.x - el.points[i].x) > 0.5 || Math.abs(p.y - el.points[i].y) > 0.5)) guideUpdates.push({ ...el, points });
  }
  const patch: DocPatch = { add: [...(moved?.add ?? [])], update: [...(moved?.update ?? []), ...guideUpdates], remove: [...(moved?.remove ?? [])], ...(moved?.order ? { order: moved.order } : {}), origin: "layout" };

  // Remember the choice as the diagram's record, when asked and when it differs from what is stored.
  if (input.remember && engine.id !== FREEFORM_ID) {
    const diagram = diagramIdOf(nodeElements.values());
    const scope = input.frameId ? ({ kind: "frame", id: input.frameId } as const) : diagram ? ({ kind: "diagram", id: diagram } as const) : ({ kind: "board" } as const);
    const wanted: LayoutRecord = buildLayoutRecord(scope, engine.id, algorithm.id, { params: input.params, incremental: governing?.incremental ?? "adjust" });
    const current = records.get(wanted.id);
    if (!current) patch.add.push(wanted);
    else if (current.engine !== wanted.engine || current.algorithm !== wanted.algorithm) patch.update.push({ ...current, engine: wanted.engine, algorithm: wanted.algorithm });
  }
  const empty_ = patch.add.length === 0 && patch.update.length === 0 && patch.remove.length === 0;
  return { patch: empty_ ? null : patch, preview };
};

/**
 * The layout record a NEW diagram is stored with: the engine of its family (until a family has its own engine,
 * the architecture engine, which is what lays every family out today), the engine's default algorithm, and
 * `adjust` for edits. Undefined when the engines are off, or the elements are not a generated diagram. A diagram
 * that already exists never gets one automatically.
 */
export const newDiagramRecord = (elements: readonly DrawingElement[], family = true): LayoutRecord | undefined => {
  if (!layoutEnginesEnabled()) return undefined;
  const nodes = elements.filter((el) => el.ai?.role === "node");
  const generation = nodes[0]?.ai?.generationId;
  if (!generation) return undefined;
  ensureLayoutEngines();
  const type = nodes[0].ai?.diagramType as keyof typeof PROFILES | undefined;
  const familyName = family && type ? PROFILES[type]?.family : undefined;
  // Only a diagram a family engine actually placed is stored as that engine's; the rest were laid out by the compiler's own (architecture) layout.
  const engine = ((familyName && engineForFamily(familyName)) || architectureEngine) as LayoutEngine;
  return buildLayoutRecord({ kind: "diagram", id: generation }, engine.id, engine.algorithms[0].id, { incremental: "adjust" });
};

/** A patch that adds a freshly laid-out diagram: positions are `auto` (a layout placed them), except the nodes whose code gave an explicit position. */
export const newDiagramPatch = (elements: DrawingElement[], explicitNodeIds: ReadonlySet<string> = new Set(), family = true): DocPatch => {
  const record = newDiagramRecord(elements, family);
  const placements: Record<string, "auto" | "user"> = {};
  for (const el of elements) if (el.ai?.role === "node" && el.ai.semanticId && explicitNodeIds.has(el.ai.semanticId)) placements[el.id] = "user";
  return { add: record ? [...elements, record] : elements, update: [], remove: [], origin: "layout", ...(Object.keys(placements).length > 0 ? { placements } : {}) };
};

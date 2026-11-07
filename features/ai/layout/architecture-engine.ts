import { algorithmOf, registerLayoutEngine } from "@/core/layout/registry";
import { affectedSet } from "@/core/layout/kit/diff";
import { fixedIds } from "@/core/layout/kit/fixed";
import type { LayoutEngine, LayoutGraph, LayoutRequest, LayoutResult } from "@/core/layout/types";
import { buildAIDiagramDocument } from "@/features/ai/compiler/validation";
import { normalizeModelGraphDraftDetailed, normalizeModelPlan } from "@/features/ai/schemas";
import { compileAIDiagramDetailed, type DepthMode } from "@/features/ai/compiler/canvas-compiler";
import type { NodePin } from "./pins";
import type { AIDiagramDocumentV1 } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

/**
 * The architecture engine: today's layered layout, unchanged, behind the layout-engine interface. It builds the
 * same diagram document the compiler uses and runs the same compile (`compileAIDiagramDetailed`), so for an
 * untouched diagram its positions are exactly the compiler's. What the interface adds is who may move: nodes
 * the request holds fixed are given to the compiler as pins in its own coordinates, so they are not moved and
 * the rest is laid out around them.
 */

const round = (n: number) => Math.round(n * 1000) / 1000 + 0;
/** A move smaller than this is not a move: the node keeps its stored coordinates exactly. */
const EPSILON = 0.5;

const centre = (x: number, y: number, size: { width: number; height: number }) => ({ x: x + size.width / 2, y: y + size.height / 2 });

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** The diagram document the compiler lays out, from a layout graph. Nodes and groups get plain internal ids, mapped back by the caller. */
const DIRECTION_HINT = { right: "left-to-right", up: "bottom-to-top", left: "right-to-left" } as const;

const documentFromGraph = (graph: LayoutGraph, internal: { node: Map<string, string>; group: Map<string, string> }): AIDiagramDocumentV1 => {
  graph.nodes.forEach((node, i) => internal.node.set(node.id, `n${i}`));
  graph.containers.forEach((container, i) => internal.group.set(container.id, `g${i}`));
  const { graph: normalized } = normalizeModelGraphDraftDetailed({
    nodes: graph.nodes.map((node) => ({ id: internal.node.get(node.id), label: node.label ?? node.id, kind: node.kind, icon: node.icon, shape: node.shape })),
    edges: graph.edges.flatMap((edge) => (internal.node.has(edge.from) && internal.node.has(edge.to) ? [{ id: `e-${edge.id}`.slice(0, 90), from: internal.node.get(edge.from), to: internal.node.get(edge.to), label: edge.label }] : [])),
    groups: graph.containers.map((container) => ({ id: internal.group.get(container.id), label: container.label ?? container.id, nodeIds: container.members.flatMap((id) => internal.node.get(id) ?? []) })),
  });
  return buildAIDiagramDocument({
    prompt: "layout",
    // The direction the diagram was drawn in, so laying it out again does not turn a left-to-right diagram on its side.
    plan: normalizeModelPlan({ diagramType: graph.diagramType ?? "architecture", summary: "layout", ...(graph.direction ? { direction: DIRECTION_HINT[graph.direction] } : {}) }),
    graph: normalized,
    provider: "local",
    modelName: "layout",
    generationId: "layout",
    improvementPasses: 0,
  });
};

const compileNodes = (document: AIDiagramDocumentV1, pins?: Map<string, NodePin>, depthMode?: DepthMode) => {
  const elements = compileAIDiagramDetailed(document, "layout", { ...(pins && pins.size > 0 ? { pins } : {}), ...(depthMode ? { depthMode } : {}) }).elements;
  const nodes = new Map<string, { x: number; y: number }>();
  const guides = new Map<string, Array<{ x: number; y: number }>>();
  for (const element of elements as DrawingElement[]) {
    const id = element.ai?.semanticId;
    if (!id) continue;
    if (element.ai?.role === "node") nodes.set(id, { x: element.points[0].x, y: element.points[0].y });
    else if (element.ai?.role === "group" || element.ai?.role === "group-label") guides.set(`${element.ai.role}:${id}`, element.points.map((p) => ({ x: p.x, y: p.y })));
  }
  return { nodes, guides };
};

/** The row-forming mode each algorithm forces; `layered` keeps the compiler's own choice of the best candidate. */
const ALGORITHM_MODES: Record<string, DepthMode | undefined> = { layered: undefined, dependency: "flow", grouped: "stacked" };

const run = (request: LayoutRequest, incremental: boolean): LayoutResult => {
  const { graph, positions } = request;
  const internal = { node: new Map<string, string>(), group: new Map<string, string>() };
  const document = documentFromGraph(graph, internal);
  const back = new Map([...internal.node].map(([id, n]) => [n, id]));
  const backGroup = new Map([...internal.group].map(([id, g]) => [g, id]));
  const sizeOf = new Map(graph.nodes.map((n) => [n.id, n]));

  // 1. The engine's own layout of the whole diagram: where it would put everything with nothing held.
  const depthMode = ALGORITHM_MODES[request.algorithm];
  const natural = compileNodes(document, undefined, depthMode).nodes;

  // 2. The shift between the engine's coordinates and the board's, from the nodes that already have positions
  //    (the median, so a few stray nodes do not skew it): the diagram stays where it is.
  const shifts = graph.nodes.flatMap((n) => {
    const was = positions.get(n.id);
    const at = natural.get(internal.node.get(n.id)!);
    return was && at ? [{ dx: was.x - at.x, dy: was.y - at.y }] : [];
  });
  const shift = { dx: median(shifts.map((s) => s.dx)), dy: median(shifts.map((s) => s.dy)) };

  // 3. Held nodes: everything the mode fixes, and (incremental) every auto node outside the affected set. Each is a pin at its own place.
  const held = fixedIds(request);
  if (incremental && request.delta) {
    const affected = affectedSet(request.delta, graph);
    for (const n of graph.nodes) if (positions.has(n.id) && !affected.has(n.id)) held.add(n.id);
  }
  const pins = new Map<string, NodePin>();
  for (const id of held) {
    const was = positions.get(id);
    const size = sizeOf.get(id);
    if (!was || !size) continue;
    const c = centre(was.x - shift.dx, was.y - shift.dy, size);
    pins.set(internal.node.get(id)!, { x: c.x, y: c.y });
  }

  // 4. Lay out again with the held nodes in place, and bring the result back to board coordinates.
  const laid = compileNodes(document, pins, depthMode);
  const out = new Map<string, { x: number; y: number }>();
  const unplaced: LayoutResult["unplaced"] = [];
  for (const n of graph.nodes) {
    if (held.has(n.id)) continue;
    const at = laid.nodes.get(internal.node.get(n.id)!);
    if (!at) {
      unplaced.push({ id: n.id, reason: "The layout did not place it." });
      continue;
    }
    const x = round(at.x + shift.dx);
    const y = round(at.y + shift.dy);
    const was = positions.get(n.id);
    if (was && Math.abs(was.x - x) <= EPSILON && Math.abs(was.y - y) <= EPSILON) continue; // not a move: stays byte-identical
    out.set(n.id, { x, y });
  }

  const guides = new Map<string, Array<{ x: number; y: number }>>();
  for (const [key, points] of laid.guides) {
    const [role, internalId] = key.split(/:(.+)/);
    const original = backGroup.get(internalId);
    if (original) guides.set(`${role}:${original}`, points.map((p) => ({ x: round(p.x + shift.dx), y: round(p.y + shift.dy) })));
  }
  void back;
  return { positions: out, guides, moved: [...out.keys()], unplaced, diagnostics: [] };
};

export const architectureEngine: LayoutEngine = {
  id: "architecture",
  family: "architecture",
  label: "Architecture",
  algorithms: [
    { id: "layered", label: "Layered", description: "Rows by flow or tier, nodes ordered to reduce crossings, groups kept together.", defaults: {}, backend: "native" },
    { id: "dependency", label: "By dependency", description: "Rows follow the direction of the connections, so everything reads one way.", defaults: {}, backend: "native" },
    { id: "grouped", label: "Group by group", description: "Each group gets its own rows, so frames never overlap.", defaults: {}, backend: "native" },
  ],
  validate: (graph) => (graph.nodes.length === 0 ? [{ severity: "info", code: "layout/empty", message: "There is nothing to lay out." }] : []),
  layout: (request) => run(request, false),
  update: (request) => run(request, true),
};

export const registerArchitectureEngine = () => {
  registerLayoutEngine(architectureEngine);
  return algorithmOf(architectureEngine, "layered");
};

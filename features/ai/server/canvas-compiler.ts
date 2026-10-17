import { buildAnchorId } from "@/core/anchors/generate-anchors";
import { placeEdgeLabels, EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT } from "@/features/ai/server/layout/edge-labels";
import { bundleFans } from "@/features/ai/server/layout/bus";
import { FRAME_NEST_STEP, FRAME_PADDING, FRAME_TITLE_HEIGHT, frameTopBand } from "@/features/ai/server/layout/frame-constants";
import { placeGrid } from "@/features/ai/server/layout/grid-placement";
import { placeLayered } from "@/features/ai/server/layout/layered-placement";
import { withPins, type NodePin } from "@/features/ai/server/layout/pins";
import type {
  Placement,
  PlacementEngine,
  PlacementInput,
} from "@/features/ai/server/layout/types";
import type { Box } from "@/features/ai/server/layout/geometry";
import {
  chooseHandles,
  decisionExitHandle,
  spreadParallelEdges,
} from "@/features/ai/server/layout/handle-selection";
import { getConnectionHandlePoint } from "@/core/routing/connection-handles";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import { estimateTextWidth } from "@/core/text/estimate";
import { tint } from "@/core/color/named-colors";
import { sizeDiamondNode, sizePillNode, sizeSemanticNode, type NodeSize } from "@/core/text/node-size";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import {
  AIDiagramDocumentV1,
  AIDiagramGroup,
  AIDiagramNode,
} from "@/features/ai/types";
import {
  Bounds,
  ConnectionHandle,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";

interface PositionedNode {
  node: AIDiagramNode;
  element: DrawingElement;
  bounds: Bounds;
  depth: number;
}

const LAYER_ORDER = ["external", "edge", "application", "data", "observability"];

/** The colours a node of this kind gets when its code names no `color:` (so a reader can tell the two apart). */
export const kindColors = (kind: string | undefined) => (kind ? KIND_COLORS[kind] : undefined);

const KIND_COLORS: Record<string, { fill: string; stroke: string }> = {
  service: { fill: "#dbeafe", stroke: "#1e3a8a" },
  api: { fill: "#e0f2fe", stroke: "#075985" },
  gateway: { fill: "#ede9fe", stroke: "#5b21b6" },
  authentication: { fill: "#fce7f3", stroke: "#9d174d" },
  database: { fill: "#fef3c7", stroke: "#92400e" },
  cache: { fill: "#dcfce7", stroke: "#166534" },
  queue: { fill: "#ccfbf1", stroke: "#0f766e" },
  "message-broker": { fill: "#ccfbf1", stroke: "#0f766e" },
  "event-bus": { fill: "#ccfbf1", stroke: "#0f766e" },
  storage: { fill: "#ffedd5", stroke: "#9a3412" },
  dns: { fill: "#f0f9ff", stroke: "#0369a1" },
  firewall: { fill: "#fee2e2", stroke: "#991b1b" },
  waf: { fill: "#ffe4e6", stroke: "#be123c" },
  "load-balancer": { fill: "#ede9fe", stroke: "#5b21b6" },
  kubernetes: { fill: "#dbeafe", stroke: "#1d4ed8" },
  pod: { fill: "#e0f2fe", stroke: "#0369a1" },
  cluster: { fill: "#dbeafe", stroke: "#1e40af" },
  container: { fill: "#ecfeff", stroke: "#0e7490" },
  worker: { fill: "#fef9c3", stroke: "#854d0e" },
  "service-mesh": { fill: "#e0e7ff", stroke: "#3730a3" },
  deployment: { fill: "#dcfce7", stroke: "#166534" },
  namespace: { fill: "#f1f5f9", stroke: "#475569" },
  region: { fill: "#eff6ff", stroke: "#1d4ed8" },
  "availability-zone": { fill: "#eef2ff", stroke: "#4338ca" },
  user: { fill: "#f5f3ff", stroke: "#6d28d9" },
  browser: { fill: "#f5f3ff", stroke: "#6d28d9" },
  mobile: { fill: "#f5f3ff", stroke: "#6d28d9" },
  start: { fill: "#dcfce7", stroke: "#15803d" },
  end: { fill: "#fee2e2", stroke: "#b91c1c" },
  decision: { fill: "#ffe4e6", stroke: "#be123c" },
  workflow: { fill: "#e0f2fe", stroke: "#075985" },
  parallel: { fill: "#ede9fe", stroke: "#5b21b6" },
  retry: { fill: "#fef9c3", stroke: "#854d0e" },
  loop: { fill: "#fef9c3", stroke: "#854d0e" },
  agent: { fill: "#e0e7ff", stroke: "#3730a3" },
  tool: { fill: "#e2e8f0", stroke: "#334155" },
  memory: { fill: "#fef9c3", stroke: "#854d0e" },
  "vector-store": { fill: "#fef3c7", stroke: "#92400e" },
  "ai-model": { fill: "#e0e7ff", stroke: "#3730a3" },
  dashboard: { fill: "#ecfccb", stroke: "#3f6212" },
  alerting: { fill: "#fee2e2", stroke: "#b91c1c" },
  config: { fill: "#f8fafc", stroke: "#334155" },
  cicd: { fill: "#e0f2fe", stroke: "#075985" },
  external: { fill: "#f1f5f9", stroke: "#334155" },
};

const NODE_FONT_SIZE = 17;
const NODE_FONT_WEIGHT = "600";
const BASE_NODE_HEIGHT = 78;
/** Normal widest node, and the widest one allowed when a single word needs more room. */
const NODE_MAX_WIDTH = 280;
const NODE_WIDEST_WIDTH = 520;

/**
 * Decisions are real diamonds and start/end are pills, both with no icon tile; the rest are semantic
 * nodes. An explicit `shape:` wins over what the kind implies.
 */
const shapeOf = (node: AIDiagramNode): "diamond" | "pill" | undefined =>
  node.shape ?? (node.kind === "decision" ? "diamond" : node.kind === "start" || node.kind === "end" ? "pill" : undefined);
const DECISION_NODE_HEIGHT = 92;
const PILL_NODE_HEIGHT = 64;

/**
 * Width and height of a node from its label (core/text/node-size.ts): the fewest lines that fit,
 * the narrowest box for them, and a height that holds them. The minimums keep the look nodes
 * always had (168 wide, 78 tall; 92 for decisions); only labels that need more get more.
 */
export const sizeDiagramNode = (node: AIDiagramNode, density: string): NodeSize => {
  const shape = shapeOf(node);
  const sizeWith = (maxWidth: number) => {
    const input = {
      label: node.label,
      fontSize: NODE_FONT_SIZE,
      fontWeight: NODE_FONT_WEIGHT,
      minWidth: density === "compact" ? 150 : density === "spacious" ? 190 : 168,
      maxWidth,
      minHeight: shape === "diamond" ? DECISION_NODE_HEIGHT : shape === "pill" ? PILL_NODE_HEIGHT : BASE_NODE_HEIGHT,
    };
    return shape === "diamond" ? sizeDiamondNode(input) : shape === "pill" ? sizePillNode(input) : sizeSemanticNode(input);
  };
  // A long unbroken word (a table or column name) cannot wrap. Widen the box for it, up to a limit,
  // rather than let the renderer shrink the text or break the word mid-letter.
  let size = sizeWith(NODE_MAX_WIDTH);
  for (let width = NODE_MAX_WIDTH + 80; !size.fits && width <= NODE_WIDEST_WIDTH; width += 80) size = sizeWith(width);
  return size;
};

const getDepths = (document: AIDiagramDocumentV1) => {
  if (document.diagramType === "architecture") {
    return new Map(
      document.nodes.map((node) => [
        node.id,
        Math.max(0, LAYER_ORDER.indexOf(node.layer ?? "application")),
      ]),
    );
  }

  // Layers by longest path from the sources, after breaking cycles. A loop-back edge (a retry, a
  // feedback arrow) must not stop the nodes behind it from getting a layer, so depth-first search
  // finds the edges that point back up the current path and layering ignores them. For an acyclic
  // graph there are no such edges and this is the plain longest-path layering.
  const knownIds = new Set(document.nodes.map((node) => node.id));
  const edges = document.edges.filter((e) => knownIds.has(e.from) && knownIds.has(e.to) && e.from !== e.to);
  const out = new Map<string, Array<{ to: string; index: number }>>(document.nodes.map((n) => [n.id, []]));
  const indegree = new Map(document.nodes.map((n) => [n.id, 0]));
  edges.forEach((e, index) => {
    out.get(e.from)!.push({ to: e.to, index });
    indegree.set(e.to, indegree.get(e.to)! + 1);
  });

  const state = new Map<string, 0 | 1 | 2>(document.nodes.map((n) => [n.id, 0]));
  const backEdges = new Set<number>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const { to, index } of out.get(id)!) {
      if (state.get(to) === 1) backEdges.add(index);
      else if (state.get(to) === 0) visit(to);
    }
    state.set(id, 2);
  };
  // Sources first (in node order), then whatever is left (nodes only reachable through a cycle).
  // Starting from people/clients instead puts User at the top but, measured on a request/response
  // flow, makes connectors 41% longer and triples crossings, so it was tried and dropped.
  document.nodes.filter((n) => indegree.get(n.id) === 0).forEach((n) => state.get(n.id) === 0 && visit(n.id));
  document.nodes.forEach((n) => state.get(n.id) === 0 && visit(n.id));

  const remaining = new Map(document.nodes.map((n) => [n.id, 0]));
  edges.forEach((e, index) => {
    if (!backEdges.has(index)) remaining.set(e.to, remaining.get(e.to)! + 1);
  });
  const depth = new Map(document.nodes.map((node) => [node.id, 0]));
  const queue = document.nodes.filter((n) => remaining.get(n.id) === 0).map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const { to, index } of out.get(id)!) {
      if (backEdges.has(index)) continue;
      depth.set(to, Math.max(depth.get(to)!, depth.get(id)! + 1));
      remaining.set(to, remaining.get(to)! - 1);
      if (remaining.get(to) === 0) queue.push(to);
    }
  }
  return depth;
};

const asObstacle = (positioned: PositionedNode): RoutingObstacle => ({
  id: positioned.element.id,
  bounds: {
    minX: positioned.bounds.minX,
    minY: positioned.bounds.minY,
    maxX: positioned.bounds.maxX,
    maxY: positioned.bounds.maxY,
  },
});

// ── Groups ────────────────────────────────────────────────────────────────

interface GroupBox {
  group: AIDiagramGroup;
  members: PositionedNode[];
  depth: number;
}


/** Groups worth drawing: known members only, at least two, deduplicated by member set. */
const usableGroups = (
  document: AIDiagramDocumentV1,
  positioned: Map<string, PositionedNode>,
): Array<{ group: AIDiagramGroup; members: PositionedNode[] }> => {
  const seen = new Set<string>();
  return document.groups
    .map((group) => ({
      group,
      members: Array.from(new Set(group.nodeIds))
        .map((id) => positioned.get(id))
        .filter((member): member is PositionedNode => member !== undefined),
    }))
    .filter(({ group, members }) => {
      if (members.length < 2) return false;
      const key = members.map((m) => m.node.id).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return group.label.trim().length > 0;
    })
    // outer (larger) groups first so they are drawn underneath
    .sort((a, b) => b.members.length - a.members.length || a.group.id.localeCompare(b.group.id));
};

const nestingDepths = (
  groups: Array<{ group: AIDiagramGroup; members: PositionedNode[] }>,
): GroupBox[] => {
  const ids = groups.map((g) => new Set(g.members.map((m) => m.node.id)));
  const depth: number[] = new Array(groups.length).fill(0);
  // groups are sorted largest first, so every strict subset comes later
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const isSubset = [...ids[j]].every((id) => ids[i].has(id)) && ids[j].size < ids[i].size;
      if (isSubset) depth[i] = Math.max(depth[i], depth[j] + 1);
    }
  }
  return groups.map((g, i) => ({ ...g, depth: depth[i] }));
};

const frameBounds = ({ members, depth }: GroupBox) => {
  const pad = FRAME_PADDING + depth * FRAME_NEST_STEP;
  return {
    minX: Math.min(...members.map((m) => m.bounds.minX)) - pad,
    maxX: Math.max(...members.map((m) => m.bounds.maxX)) + pad,
    minY: Math.min(...members.map((m) => m.bounds.minY)) - pad - frameTopBand(depth),
    maxY: Math.max(...members.map((m) => m.bounds.maxY)) + pad,
  };
};

const intersects = (
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

const contains = (
  outer: { minX: number; maxX: number; minY: number; maxY: number },
  inner: { minX: number; maxX: number; minY: number; maxY: number },
) =>
  outer.minX <= inner.minX &&
  outer.maxX >= inner.maxX &&
  outer.minY <= inner.minY &&
  outer.maxY >= inner.maxY;

/**
 * Frames drawn under the nodes of each group. A frame is only drawn when it
 * encloses exactly its members: one that would also cover an unrelated node, or
 * partly overlap another frame, would say something the graph does not, so it
 * is left out instead.
 */
const buildGroupFrames = (
  document: AIDiagramDocumentV1,
  positioned: Map<string, PositionedNode>,
  frameId: string,
): { elements: DrawingElement[]; titleBoxes: Box[]; dropped: string[] } => {
  const boxes = nestingDepths(usableGroups(document, positioned));
  const accepted: Array<{ box: GroupBox; bounds: ReturnType<typeof frameBounds> }> = [];

  for (const box of boxes) {
    const bounds = frameBounds(box);
    const memberIds = new Set(box.members.map((m) => m.node.id));
    const swallowsStranger = [...positioned.values()].some(
      (p) => !memberIds.has(p.node.id) && intersects(bounds, p.bounds),
    );
    const clashes = accepted.some(
      ({ bounds: other }) =>
        intersects(bounds, other) && !contains(other, bounds) && !contains(bounds, other),
    );
    if (!swallowsStranger && !clashes) accepted.push({ box, bounds });
  }
  const acceptedIds = new Set(accepted.map(({ box }) => box.group.id));
  const dropped = boxes.filter(({ group }) => !acceptedIds.has(group.id)).map(({ group }) => group.id);

  const titleBoxes: Box[] = accepted.map(({ box, bounds }) => ({
    minX: bounds.minX + 12,
    minY: bounds.minY + 8,
    maxX: bounds.minX + 12 + estimateTextWidth(box.group.label, 13, "600"),
    maxY: bounds.minY + 8 + 13 * LINE_HEIGHT_RATIO,
  }));

  const elements = accepted.flatMap(({ box, bounds }) => {
    const base = `${document.metadata.generationId}-group-${box.group.id}`;
    const ai = {
      frameId,
      generationId: document.metadata.generationId,
      semanticId: box.group.id,
      diagramType: document.diagramType,
    };
    const frame: DrawingElement = {
      id: base,
      type: "rectangle",
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      color: "#94a3b8",
      strokeWidth: 1.5,
      isGuide: true,
      ai: { ...ai, role: "group" },
    };
    const title: DrawingElement = {
      id: `${base}-label`,
      type: "text",
      points: [{ x: bounds.minX + 12, y: bounds.minY + 8 }],
      color: "#64748b",
      strokeWidth: 1,
      text: box.group.label,
      fontSize: 13,
      fontWeight: "600",
      fontStyle: "normal",
      isGuide: true,
      ai: { ...ai, role: "group-label" },
    };
    return [frame, title];
  });
  return { elements, titleBoxes, dropped };
};

// ── Compile ───────────────────────────────────────────────────────────────

export interface CompileDiagnostics {
  /** Edge labels that could not be placed clear of nodes, other labels and each other. */
  collidingLabels: string[];
  /** Groups declared with a label and two or more members that were not drawn as a frame. */
  droppedGroups: string[];
  /** Nodes whose label needs more lines than a node may show; the renderer shrinks their text. */
  unfittedNodes: string[];
  /** Set when the layout engine threw and the plain grid was used instead; holds the error message. */
  layoutFallback?: string;
}

export interface CompileResult {
  elements: DrawingElement[];
  diagnostics: CompileDiagnostics;
}

/** Sizes, graph and gaps for a layout engine; everything an engine may use, nothing it must not. */
export const prepareDiagram = (document: AIDiagramDocumentV1) => {
  const depthByNodeId = getDepths(document);
  const density = document.styleHints.density;
  const groups = usableGroups(
    document,
    // sizes are not known yet; membership alone decides whether groups exist
    new Map(document.nodes.map((node) => [node.id, { node } as PositionedNode])),
  );
  const maxNesting = Math.max(0, ...nestingDepths(groups).map((g) => g.depth));
  const frameRoom = groups.length > 0 ? 40 + maxNesting * (FRAME_NEST_STEP + FRAME_TITLE_HEIGHT) : 0;
  const horizontalGap =
    (density === "compact" ? 52 : density === "spacious" ? 112 : 78) + frameRoom / 2;
  // Row pitch was 138 for 78px nodes: the gap between rows, not the pitch, is what stays constant.
  const verticalGap =
    (density === "compact" ? 112 : density === "spacious" ? 168 : 138) - BASE_NODE_HEIGHT + frameRoom;

  // Nodes ordered as before (column hint, then label) as the starting point.
  const ordered = [...document.nodes].sort((a, b) => {
    const ac = a.column ?? Number.MAX_SAFE_INTEGER;
    const bc = b.column ?? Number.MAX_SAFE_INTEGER;
    return ac - bc || a.label.localeCompare(b.label);
  });

  // The outermost group a node belongs to keeps its members side by side.
  const clusterOf = new Map<string, string>();
  groups.forEach(({ group, members }) =>
    members.forEach((m) => {
      if (!clusterOf.has(m.node.id)) clusterOf.set(m.node.id, group.id);
    }),
  );

  // Nested chain of groups per node, outermost first; a group that only partly overlaps the chain
  // (neither inside nor around it) cannot be nested and is not part of the path.
  const memberSets = groups.map(({ group, members }) => ({ id: group.id, ids: new Set(members.map((m) => m.node.id)) }));
  const pathOf = new Map<string, string[]>();
  document.nodes.forEach((node) => {
    const chain = memberSets.filter((g) => g.ids.has(node.id)); // already outermost (largest) first
    const path: Array<(typeof memberSets)[number]> = [];
    chain.forEach((g) => {
      const last = path[path.length - 1];
      if (!last || (g.ids.size < last.ids.size && [...g.ids].every((id) => last.ids.has(id)))) path.push(g);
    });
    if (path.length > 0) pathOf.set(node.id, path.map((g) => g.id));
  });

  const sizes = new Map(document.nodes.map((node) => [node.id, sizeDiagramNode(node, density)]));
  const knownIds = new Set(document.nodes.map((n) => n.id));
  const input: PlacementInput = {
    nodes: ordered.map((node) => ({
      id: node.id,
      depth: depthByNodeId.get(node.id) ?? 0,
      width: sizes.get(node.id)!.width,
      height: sizes.get(node.id)!.height,
      cluster: clusterOf.get(node.id),
      clusterPath: pathOf.get(node.id),
    })),
    edges: document.edges
      .filter((edge) => knownIds.has(edge.from) && knownIds.has(edge.to))
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        labelWidth: edge.label?.trim()
          ? Math.ceil(estimateTextWidth(edge.label.trim(), EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT))
          : undefined,
      })),
    groups: groups.map(({ group, members }) => ({ id: group.id, nodeIds: members.map((m) => m.node.id) })),
    gaps: { horizontal: horizontalGap, vertical: verticalGap, groupRoom: frameRoom },
  };
  return { input, sizes };
};

/** Everything after node placement: elements, group frames, routed connectors, edge labels. */
export const buildCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
  prepared: ReturnType<typeof prepareDiagram>,
  placement: Placement,
): CompileResult => {
  const { input, sizes } = prepared;
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const depthById = new Map(input.nodes.map((n) => [n.id, n.depth]));
  const positionedByNodeId = new Map<string, PositionedNode>();
  const nodeElements: DrawingElement[] = [];

  // Reading order (top to bottom, left to right) keeps element order stable and readable.
  const order = [...placement.entries()].sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  order.forEach(([id, at]) => {
    const node = nodeById.get(id);
    const size = sizes.get(id);
    if (!node || !size) return;
    const depth = depthById.get(id) ?? 0;
    const style = node.color
      ? { fill: tint(node.color, 0.88), stroke: node.color }
      : (KIND_COLORS[node.kind] ?? {
          fill: depth % 2 === 0 ? "#f8fafc" : "#eef2ff",
          stroke: "#1f2937",
        });
    const importance =
      document.visualImportance.find((entry) => entry.nodeId === node.id)?.score ?? 5;
    const bounds: Bounds = {
      minX: at.x,
      minY: at.y,
      maxX: at.x + size.width,
      maxY: at.y + size.height,
      width: size.width,
      height: size.height,
    };
    const element: DrawingElement = {
      id: `${document.metadata.generationId}-${node.id}`,
      type: shapeOf(node) ?? "semantic-node",
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      color: style.stroke,
      strokeWidth: importance >= 8 ? 3 : 2,
      fill: style.fill,
      label: node.label,
      fontSize: NODE_FONT_SIZE,
      fontWeight: NODE_FONT_WEIGHT,
      ai: {
        frameId,
        generationId: document.metadata.generationId,
        semanticId: node.id,
        semanticKind: node.kind,
        ...(node.icon ? { icon: node.icon } : {}),
        diagramType: document.diagramType,
        role: "node",
      },
    };
    nodeElements.push(element);
    positionedByNodeId.set(node.id, { node, element, bounds, depth });
  });

  const frames = buildGroupFrames(document, positionedByNodeId, frameId);
  const elements: DrawingElement[] = [...frames.elements, ...nodeElements];

  const obstacles = Array.from(positionedByNodeId.values()).map(asObstacle);
  const arrowDrafts: Array<{
    edgeId: string;
    label?: string;
    descriptor: RouteArrowDescriptor;
    fromHandle: ConnectionHandle;
    toHandle: ConnectionHandle;
    sourceElementId: string;
    targetElementId: string;
    bidirectional: boolean;
    dashed: boolean;
    plain: boolean;
    color?: string;
  }> = [];

  const usedHandlePairs = new Map<string, number>();
  const outDegree = new Map<string, number>();
  document.edges.forEach((edge) => outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1));
  const usedOutHandles = new Set<string>();
  document.edges.forEach((edge, index) => {
    const source = positionedByNodeId.get(edge.from);
    const target = positionedByNodeId.get(edge.to);
    if (!source || !target) return;
    const base = decisionExitHandle(
      source,
      target,
      chooseHandles(source, target),
      outDegree.get(edge.from) ?? 0,
      usedOutHandles,
    );
    usedOutHandles.add(`${edge.from}.${base.from}`);
    const handles = spreadParallelEdges(base, source, target, usedHandlePairs);
    const start = getConnectionHandlePoint(source.bounds, handles.from);
    const end = getConnectionHandlePoint(target.bounds, handles.to);
    const edgeId = `${document.metadata.generationId}-${edge.id || `edge-${index + 1}`}`;
    arrowDrafts.push({
      edgeId,
      label: edge.label?.trim() || undefined,
      fromHandle: handles.from,
      toHandle: handles.to,
      sourceElementId: source.element.id,
      targetElementId: target.element.id,
      bidirectional: Boolean(edge.bidirectional),
      dashed: Boolean(edge.dashed),
      plain: Boolean(edge.plain),
      color: edge.color,
      descriptor: {
        arrowId: edgeId,
        sourceId: source.element.id,
        targetId: target.element.id,
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        startHandle: handles.from,
        endHandle: handles.to,
        routingMode: "orthogonal",
        routePreference:
          handles.from === "top" || handles.from === "bottom" ? "vh" : "hv",
      },
    });
  });

  const routed = routeArrowBatch({
    arrows: arrowDrafts.map((draft) => draft.descriptor),
    obstacles,
    obstaclePadding: 18,
    parallelSpacing: 14,
    pathRanking: {
      bendPenalty: 900,
      lengthPenalty: 1,
      detourPenalty: 0.15,
      preferencePenalty: 48,
      crossingPenalty: 1200,
    },
  });

  // Siblings leaving (or entering) one node side share a bus level where that is clear of nodes.
  const bundled = bundleFans(
    arrowDrafts.map((draft) => ({
      id: draft.edgeId,
      points: routed.get(draft.edgeId) ?? [draft.descriptor.start, draft.descriptor.end],
      sourceId: draft.sourceElementId,
      targetId: draft.targetElementId,
      fromHandle: draft.fromHandle,
      toHandle: draft.toHandle,
    })),
    Array.from(positionedByNodeId.values()).map((p) => ({
      id: p.element.id,
      box: { minX: p.bounds.minX, minY: p.bounds.minY, maxX: p.bounds.maxX, maxY: p.bounds.maxY },
    })),
  );

  const paths = new Map<string, Point[]>();
  arrowDrafts.forEach((draft) => {
    const points = bundled.get(draft.edgeId)!;
    paths.set(draft.edgeId, points);
    elements.push({
      id: draft.edgeId,
      type: draft.bidirectional ? "arrow-bidirectional" : "arrow",
      points,
      color: draft.color ?? "#64748b",
      strokeWidth: 2,
      dashed: draft.dashed,
      arrowHeadStart: draft.bidirectional && !draft.plain,
      arrowHeadEnd: !draft.plain,
      routingMode: "orthogonal",
      routePreference: draft.descriptor.routePreference,
      isManuallyRouted: false,
      startConnection: {
        elementId: draft.sourceElementId,
        anchorId: buildAnchorId(draft.sourceElementId, draft.fromHandle),
      },
      endConnection: {
        elementId: draft.targetElementId,
        anchorId: buildAnchorId(draft.targetElementId, draft.toHandle),
      },
      ai: {
        frameId,
        generationId: document.metadata.generationId,
        semanticId: draft.edgeId,
        diagramType: document.diagramType,
        role: "edge",
      },
    });
  });

  // Labels go last: they need the routed paths, the nodes and the frame titles to stay clear of.
  const labelDrafts = arrowDrafts.filter((draft) => draft.label);
  const placed = placeEdgeLabels(
    labelDrafts.map((draft) => ({ id: draft.edgeId, text: draft.label!, points: paths.get(draft.edgeId)! })),
    [...Array.from(positionedByNodeId.values()).map((p) => p.bounds), ...frames.titleBoxes],
    paths,
  );
  const labelElements: DrawingElement[] = placed.map((label) => {
    const draft = labelDrafts.find((d) => d.edgeId === label.id)!;
    return {
      id: `${draft.edgeId}-label`,
      type: "text",
      points: [label.position],
      color: "#475569",
      strokeWidth: 1,
      text: draft.label,
      fontSize: EDGE_LABEL_FONT_SIZE,
      fontWeight: EDGE_LABEL_FONT_WEIGHT,
      fontStyle: "normal",
      isGuide: true,
      ai: {
        frameId,
        generationId: document.metadata.generationId,
        semanticId: `${draft.edgeId}-label`,
        diagramType: document.diagramType,
        role: "edge-label",
      },
    } as DrawingElement;
  });

  return {
    elements: [...elements, ...labelElements],
    diagnostics: {
      collidingLabels: placed.filter((p) => p.collides).map((p) => p.id),
      droppedGroups: frames.dropped,
      unfittedNodes: [...sizes.entries()].filter(([, size]) => !size.fits).map(([id]) => id),
    },
  };
};

export interface CompileOptions {
  engine?: PlacementEngine;
  /** Nodes (by diagram node id) that must keep their centre; everything else is laid out around them. */
  pins?: Map<string, NodePin>;
}

export const compileAIDiagramDetailed = (
  document: AIDiagramDocumentV1,
  frameId: string,
  { engine = placeLayered, pins }: CompileOptions = {},
): CompileResult => {
  const prepared = prepareDiagram(document);
  const place = pins && pins.size > 0 ? withPins(engine, pins) : engine;
  let placement: Placement;
  let layoutFallback: string | undefined;
  try {
    placement = place(prepared.input);
  } catch (error) {
    // A layout bug must cost the diagram its tidiness, not the whole generation.
    layoutFallback = error instanceof Error ? error.message : String(error);
    placement = placeGrid(prepared.input);
  }
  const result = buildCanvas(document, frameId, prepared, placement);
  return layoutFallback ? { ...result, diagnostics: { ...result.diagnostics, layoutFallback } } : result;
};

export const compileAIDiagramToCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
  options: CompileOptions = {},
): DrawingElement[] => compileAIDiagramDetailed(document, frameId, options).elements;


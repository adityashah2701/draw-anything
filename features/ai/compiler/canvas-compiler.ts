import { buildAnchorId } from "@/core/anchors/generate-anchors";
import { placeEdgeLabels, EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT } from "@/features/ai/layout/edge-labels";
import { bundleFans } from "@/features/ai/layout/bus";
import {
  FRAME_NEST_STEP,
  FRAME_PADDING,
  groupFrameStyle,
  FRAME_TITLE_FONT_SIZE,
  FRAME_TITLE_FONT_WEIGHT,
  FRAME_TITLE_HEIGHT,
  frameTopBand,
} from "@/features/ai/layout/frame-constants";

/** Where a group heading starts, from its frame's top-left corner. */
const FRAME_TITLE_INSET = 16;
const FRAME_TITLE_TOP = 8;
import { placeGrid } from "@/features/ai/layout/grid-placement";
import { placeLayered } from "@/features/ai/layout/layered-placement";
import { placeGroupHeadings, type HeadingRequest } from "@/features/ai/layout/group-headings";
import { measureLayout } from "@/features/ai/layout/metrics";
import { DEFAULT_ARROW_CORNER_RADIUS } from "@/core/shapes/arrow/corner-radius";
import { portAnchorId, portPoint, spreadFractions } from "@/core/anchors/ports";
import { profileFor, type ConnectorStyle } from "@/features/ai/diagram-agent/profiles";
import { codeDirectionOf, withDirection } from "@/features/ai/layout/direction";
import { verticalGapsByDepth } from "@/features/ai/layout/channels";
import { withOffsets, withPins, type NodeOffset, type NodePin } from "@/features/ai/layout/pins";
import type {
  Placement,
  PlacementEngine,
  PlacementInput,
} from "@/features/ai/layout/types";
import type { Box } from "@/features/ai/layout/geometry";
import {
  chooseHandles,
  decisionExitHandle,
  spreadParallelEdges,
} from "@/features/ai/layout/handle-selection";
import { categoryTint, iconForNode } from "@/core/icons/registry";
import { getConnectionHandlePoint } from "@/core/routing/connection-handles";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import { estimateTextWidth } from "@/core/text/estimate";
import { tint } from "@/core/color/named-colors";
import { sizeDiamondNode, sizeIconNode, sizeOutlineNode, sizePillNode, sizeSemanticNode, type NodeSize } from "@/core/text/node-size";
import { isOutlineVariantId, outlineForParams } from "@/core/shapes/outline/variants";
import { LINE_HEIGHT_RATIO } from "@/core/text/typography";
import {
  AIDiagramDocumentV1,
  AIDiagramGroup,
  AIDiagramNode,
} from "@/features/ai/types";
import {
  Bounds,
  ConnectionHandle,
  ConnectorRelation,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { normalizeRelation } from "@/core/shapes/arrow/relations";
import { entityTableSize } from "@/core/shapes/entity-table/layout";
import { HEAD_HEIGHT as LIFELINE_HEAD_HEIGHT, headWidth } from "@/core/shapes/lifeline/definition";
import { parseRows } from "@/core/shapes/entity-table/rows";
import { classifierSize } from "@/core/shapes/uml-classifier/layout";
import { mindmapSize } from "@/core/shapes/mindmap-node/definition";
import { BRANCH_COLORS } from "@/core/mindmap/tree-api";

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
const shapeOf = (node: AIDiagramNode): "diamond" | "pill" | "icon" | (string & {}) | undefined => {
  // `shape: icon` draws just the glyph, so it needs one: a named icon, or a kind that has its own (the
  // normaliser drops an `icon:` equal to the kind's, so `[kind: database, shape: icon]` is enough).
  if (node.shape === "icon") return node.icon || node.kind !== "generic" ? "icon" : undefined;
  const shape = node.shape ?? (node.kind === "decision" ? "diamond" : node.kind === "start" || node.kind === "end" ? "pill" : undefined);
  // A border or marker is a parameter of an outline, so the plain shape is drawn by its base outline. A stack is
  // too, except on a plain node, where it is a modifier that keeps the icon (see `nodeStyle` below).
  const stackedOutline = node.stack && shape !== undefined && shape !== "rectangle";
  return node.border || node.marker || stackedOutline ? (outlineForParams(shape) ?? shape) : shape;
};
const ICON_NODE_FONT_SIZE = 14;

/** Structured shapes (entity table, classifier, topic, lifeline) are sized by their own layout modules, from their content. */
const STRUCTURED_TYPES: Record<string, DrawingElement["type"]> = { entity: "entity-table", class: "uml-classifier", topic: "mindmap-node", lifeline: "lifeline" };
const structuredSize = (node: AIDiagramNode, shape: string | undefined): NodeSize | null => {
  const data = node.data ?? {};
  if (shape === "entity") return { ...entityTableSize({ name: node.label, kind: data.variant as never, rows: parseRows(data.rows) }), fits: true } as NodeSize;
  if (shape === "class") return { ...classifierSize({ name: node.label, kind: data.variant as never, stereotype: data.stereotype, attributes: splitMembers(data.attributes), operations: splitMembers(data.operations) }), fits: true } as NodeSize;
  if (shape === "topic") return { ...mindmapSize({ role: (data.mindRole as "central" | "main" | "sub" | "leaf" | undefined) ?? "sub", label: node.label }), fits: true } as NodeSize;
  // The slot is as wide as the head plus room for the messages' labels; the drawn body is narrow and centred in it.
  if (shape === "lifeline") return { width: Math.max(LIFELINE_SLOT_WIDTH, headWidth({ name: node.label }) + 10), height: 120, fits: true } as NodeSize;
  return null;
};
const splitMembers = (text: string | undefined) => (text ? text.split(";").map((s) => s.trim()).filter(Boolean) : []);

/** Topics' roles and branch colours from the diagram's edges: the topic nothing points to is the centre, its children are main branches (each its own colour), everything below inherits. */
const mindmapRoles = (document: AIDiagramDocumentV1) => {
  const topics = new Set(document.nodes.filter((n) => n.shape === "topic").map((n) => n.id));
  const parent = new Map<string, string>();
  for (const e of document.edges) if (topics.has(e.from) && topics.has(e.to) && !parent.has(e.to) && e.from !== e.to) parent.set(e.to, e.from);
  const depth = (id: string, seen = new Set<string>()): number => (parent.has(id) && !seen.has(id) ? 1 + depth(parent.get(id)!, seen.add(id)) : 0);
  const mainIndex = new Map<string, number>();
  document.nodes.filter((n) => topics.has(n.id) && depth(n.id) === 1).forEach((n, i) => mainIndex.set(n.id, i));
  const colorOf = (id: string): string | undefined => {
    let at = id;
    for (let g = 0; g < 50 && parent.has(at) && depth(at) > 1; g += 1) at = parent.get(at)!;
    const i = mainIndex.get(at);
    return i === undefined ? undefined : BRANCH_COLORS[i % BRANCH_COLORS.length];
  };
  return { parent, role: (id: string): "central" | "main" | "sub" | "leaf" => (depth(id) === 0 ? "central" : depth(id) === 1 ? "main" : depth(id) === 2 ? "sub" : "leaf"), colorOf };
};
const LIFELINE_SLOT_WIDTH = 150;
/** Vertical room each message gets on a lifeline; the body grows with the number of messages. */
const MESSAGE_STEP = 56;
const DECISION_NODE_HEIGHT = 92;
const PILL_NODE_HEIGHT = 64;

/**
 * Width and height of a node from its label (core/text/node-size.ts): the fewest lines that fit,
 * the narrowest box for them, and a height that holds them. The minimums keep the look nodes
 * always had (168 wide, 78 tall; 92 for decisions); only labels that need more get more.
 */
export const sizeDiagramNode = (node: AIDiagramNode, density: string): NodeSize => {
  const shape = shapeOf(node);
  const structured = structuredSize(node, shape);
  if (structured) return structured;
  if (shape === "icon") return sizeIconNode({ label: node.label, fontSize: ICON_NODE_FONT_SIZE, fontWeight: NODE_FONT_WEIGHT });
  if (shape && isOutlineVariantId(shape)) return sizeOutlineNode(shape, { label: node.label, fontSize: NODE_FONT_SIZE, fontWeight: NODE_FONT_WEIGHT, maxWidth: NODE_MAX_WIDTH });
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

/**
 * How nodes are put in rows. `layers`: an architecture's own tiers (edge, application, data...), which
 * is right when they are meaningful. `flow`: the longest path through the connections, as for every
 * other diagram type. A diagram written as code names no tiers, so nearly everything falls in
 * "application": one wide row of connected nodes with long, tangled connectors. Which of the two is
 * better is measured, not guessed (see `compileAIDiagramDetailed`).
 */
export type DepthMode = "layers" | "flow" | "stacked";

/**
 * Two groups that share a row get frames that partly overlap, and the compiler then drops one. So
 * when connections run from group A to group B (more than the other way) and B starts on a row A
 * still uses, B and everything below it move down past A. Moving a node down never breaks the
 * downward direction of its connections; nested and unrelated groups are left alone.
 */
const separateGroupRows = (
  document: AIDiagramDocumentV1,
  edges: Array<{ from: string; to: string }>,
  depth: Map<string, number>,
) => {
  const groups = document.groups.map((g) => ({ ids: new Set(g.nodeIds.filter((id) => depth.has(id))) })).filter((g) => g.ids.size >= 2);
  const nested = (a: Set<string>, b: Set<string>) => [...a].every((id) => b.has(id)) || [...b].every((id) => a.has(id));
  const rows = (g: Set<string>) => [...g].map((id) => depth.get(id)!);
  const between = (a: Set<string>, b: Set<string>) => edges.filter((e) => a.has(e.from) && b.has(e.to)).length;

  for (let round = 0; round < 12; round += 1) {
    let moved = false;
    for (const a of groups) {
      for (const b of groups) {
        if (a === b || [...a.ids].some((id) => b.ids.has(id)) || nested(a.ids, b.ids)) continue;
        if (between(a.ids, b.ids) <= between(b.ids, a.ids) || between(a.ids, b.ids) === 0) continue;
        const shift = Math.max(...rows(a.ids)) + 1 - Math.min(...rows(b.ids));
        if (shift <= 0) continue;
        // B, plus whatever hangs below it through downward connections (never A itself).
        const move = new Set(b.ids);
        for (let grew = true; grew; ) {
          grew = false;
          for (const e of edges) {
            if (move.has(e.from) && !move.has(e.to) && !a.ids.has(e.to) && depth.get(e.to)! > depth.get(e.from)!) {
              move.add(e.to);
              grew = true;
            }
          }
        }
        move.forEach((id) => depth.set(id, depth.get(id)! + shift));
        moved = true;
      }
    }
    if (!moved) break;
  }
};

const getDepths = (document: AIDiagramDocumentV1, mode: DepthMode = "layers") => {
  if (document.diagramType === "architecture" && mode === "layers") {
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
  // A member with no connection (yet) would sit on the top row and stretch its group's frame over
  // every row in between: put it level with the group's first connected member instead.
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  document.groups.forEach((group) => {
    const mates = group.nodeIds.filter((id) => connected.has(id) && depth.has(id));
    if (mates.length === 0) return;
    const row = Math.min(...mates.map((id) => depth.get(id)!));
    group.nodeIds.forEach((id) => depth.has(id) && !connected.has(id) && depth.set(id, row));
  });
  if (mode === "stacked") separateGroupRows(document, edges, depth);
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
): { elements: DrawingElement[]; headings: HeadingRequest[]; members: Map<string, Set<string>>; dropped: string[] } => {
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

  const headings: HeadingRequest[] = accepted.map(({ box, bounds }) => ({
    id: `${document.metadata.generationId}-group-${box.group.id}-label`,
    frame: bounds,
    width: Math.ceil(estimateTextWidth(box.group.label, FRAME_TITLE_FONT_SIZE, FRAME_TITLE_FONT_WEIGHT)),
    height: FRAME_TITLE_FONT_SIZE * LINE_HEIGHT_RATIO,
    top: FRAME_TITLE_TOP,
    inset: FRAME_TITLE_INSET,
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
      // An accent by nesting level with a translucent tint of it (hit-tested on its border only, see the rectangle).
      ...groupFrameStyle(accepted.filter((other) => other.box !== box && contains(other.bounds, bounds)).length),
      isGuide: true,
      ai: { ...ai, role: "group" },
    };
    const title: DrawingElement = {
      id: `${base}-label`,
      type: "text",
      points: [{ x: bounds.minX + FRAME_TITLE_INSET, y: bounds.minY + FRAME_TITLE_TOP }],
      color: "#000000",
      strokeWidth: 1,
      text: box.group.label,
      fontSize: FRAME_TITLE_FONT_SIZE,
      fontWeight: FRAME_TITLE_FONT_WEIGHT,
      fontStyle: "normal",
      isGuide: true,
      ai: { ...ai, role: "group-label" },
    };
    return [frame, title];
  });
  // Which nodes belong to each heading's group, for the check that a frame may grow.
  const members = new Map(accepted.map(({ box }) => [`${document.metadata.generationId}-group-${box.group.id}-label`, new Set(box.members.map((m) => m.node.id))]));
  return { elements, headings, members, dropped };
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

/**
 * Which connector ends get their own point on a node side. A side that carries both arrivals and
 * departures, or several arrivals, is spread so the lines and arrowheads do not pile onto one point;
 * several departures from one side keep sharing a point, which is what makes them read as one trunk
 * (`bundleFans`). Only plain boxes are spread: a diamond's side point is its corner, a pill's and an
 * icon's is not a straight edge. Ends are ordered by where the other end is, so lines do not cross at
 * the node.
 */
const tableStem = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ies|es|s)$/, "");
const refersTo = (node: AIDiagramNode, other: AIDiagramNode) =>
  [...(node.data?.rows ?? "").matchAll(/(?:->|references)\s*(\w+)/gi)].some((m) => [other.label, other.id].some((name) => tableStem(m[1]) === tableStem(name)));
/** The parent end of a connection between two tables, from their foreign keys: the table that references the other is the child. */
const foreignKeyParent = (from: AIDiagramNode | undefined, to: AIDiagramNode | undefined): "from" | "to" | undefined => {
  if (!from || !to || from.shape !== "entity" || to.shape !== "entity") return undefined;
  const fromRefs = refersTo(from, to), toRefs = refersTo(to, from);
  return fromRefs && !toRefs ? "to" : toRefs && !fromRefs ? "from" : undefined;
};

const TABLE_TYPES: ReadonlySet<string> = new Set(["entity-table", "uml-classifier"]);

const spreadPorts = (
  items: Array<{ source: PositionedNode; target: PositionedNode; handles: { from: ConnectionHandle; to: ConnectionHandle } }>,
): Array<{ from?: number; to?: number }> => {
  type End = { item: number; role: "from" | "to"; other: PositionedNode };
  const groups = new Map<string, { node: PositionedNode; side: ConnectionHandle; ends: End[] }>();
  items.forEach(({ source, target, handles }, item) => {
    const add = (node: PositionedNode, side: ConnectionHandle, role: "from" | "to", other: PositionedNode) => {
      const key = `${node.element.id}.${side}`;
      const group = groups.get(key) ?? { node, side, ends: [] };
      group.ends.push({ item, role, other });
      groups.set(key, group);
    };
    add(source, handles.from, "from", target);
    add(target, handles.to, "to", source);
  });

  const result: Array<{ from?: number; to?: number }> = items.map(() => ({}));
  for (const { node, side, ends } of groups.values()) {
    // A table or a class spreads every end: each crow's foot or diamond needs its own point on the side.
    const table = TABLE_TYPES.has(node.element.type);
    if ((node.element.type !== "semantic-node" && !table) || ends.length < 2) continue;
    const arrivals = ends.filter((e) => e.role === "to").length;
    const departures = ends.length - arrivals;
    if (!table && !(arrivals >= 2 || (arrivals >= 1 && departures >= 1))) continue;
    const horizontal = side === "top" || side === "bottom";
    const along = (n: PositionedNode) => (horizontal ? (n.bounds.minX + n.bounds.maxX) / 2 : (n.bounds.minY + n.bounds.maxY) / 2);
    const ordered = [...ends].sort((a, b) => along(a.other) - along(b.other) || a.item - b.item);
    const length = horizontal ? node.bounds.maxX - node.bounds.minX : node.bounds.maxY - node.bounds.minY;
    const fractions = spreadFractions(ordered.length, length);
    ordered.forEach((end, i) => {
      result[end.item][end.role] = fractions[i];
    });
  }
  return result;
};

/** Sizes, graph and gaps for a layout engine; everything an engine may use, nothing it must not. */
export const prepareDiagram = (
  document: AIDiagramDocumentV1,
  mode: DepthMode = "layers",
  /** Widen the rows that many connectors cross. Opt-in: a drawing being edited must not stretch when a connection is added. */
  channelGaps = false,
) => {
  const depthByNodeId = getDepths(document, mode);
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

  // A size given in the code wins over the one worked out from the label.
  const sizes = new Map(
    document.nodes.map((node) => {
      const computed = sizeDiagramNode(node, density);
      return [node.id, node.width !== undefined || node.height !== undefined ? { ...computed, width: node.width ?? computed.width, height: node.height ?? computed.height } : computed];
    }),
  );
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
        ...(edge.relation ? { relation: edge.relation } : {}),
        ...((parent) => (parent ? { parent } : {}))(foreignKeyParent(document.nodes.find((n) => n.id === edge.from), document.nodes.find((n) => n.id === edge.to))),
        labelWidth: edge.label?.trim()
          ? Math.ceil(estimateTextWidth(edge.label.trim(), EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT))
          : undefined,
      })),
    groups: groups.map(({ group, members }) => ({ id: group.id, nodeIds: members.map((m) => m.node.id) })),
    gaps: { horizontal: horizontalGap, vertical: verticalGap, groupRoom: frameRoom },
  };
  // Rows that many (or labelled) connectors cross get a wider gap; the rest keep the plain one.
  if (channelGaps) input.gaps.verticalByDepth = verticalGapsByDepth(input.edges, depthByNodeId, verticalGap);
  return { input, sizes };
};

/** Everything after node placement: elements, group frames, routed connectors, edge labels. */
export const buildCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
  prepared: ReturnType<typeof prepareDiagram>,
  placement: Placement,
  edgeSides?: EdgeSides,
  spread = true,
  connector?: ConnectorStyle,
): CompileResult => {
  const { input, sizes } = prepared;
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const depthById = new Map(input.nodes.map((n) => [n.id, n.depth]));
  const positionedByNodeId = new Map<string, PositionedNode>();
  const nodeElements: DrawingElement[] = [];
  const mind = mindmapRoles(document);

  // Reading order (top to bottom, left to right) keeps element order stable and readable.
  const order = [...placement.entries()].sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
  const lifelineIds = new Set(document.nodes.filter((n) => shapeOf(n) === "lifeline").map((n) => n.id));
  const messageCount = document.edges.filter((e) => lifelineIds.has(e.from) && lifelineIds.has(e.to) && e.from !== e.to).length;
  order.forEach(([id, at]) => {
    const node = nodeById.get(id);
    const size = sizes.get(id);
    if (!node || !size) return;
    const depth = depthById.get(id) ?? 0;
    const nodeShape = shapeOf(node);
    // Tables, classes, lifelines and topics keep a neutral look: a kind such as `database` must not paint an ER table orange.
    const neutral = !!nodeShape && nodeShape in STRUCTURED_TYPES;
    const style = node.color
      ? { fill: tint(node.color, 0.88), stroke: node.color }
      : ((neutral ? undefined : KIND_COLORS[node.kind]) ?? {
          fill: depth % 2 === 0 ? "#f8fafc" : "#eef2ff",
          stroke: "#1f2937",
        });
    const importance =
      document.visualImportance.find((entry) => entry.nodeId === node.id)?.score ?? 5;
    const shape = shapeOf(node);
    // A lifeline's body is a narrow strip under its head, centred in its slot and tall enough for every message.
    const isLifeline = shape === "lifeline";
    const bodyW = 16;
    const bodyH = Math.max(140, MESSAGE_STEP * (messageCount + 1));
    const bounds: Bounds = isLifeline
      ? { minX: at.x + (size.width - bodyW) / 2, minY: at.y + LIFELINE_HEAD_HEIGHT, maxX: at.x + (size.width + bodyW) / 2, maxY: at.y + LIFELINE_HEAD_HEIGHT + bodyH, width: bodyW, height: bodyH }
      : { minX: at.x, minY: at.y, maxX: at.x + size.width, maxY: at.y + size.height, width: size.width, height: size.height };
    const structuredType = shape ? STRUCTURED_TYPES[shape] : undefined;
    const isIcon = shape === "icon";
    // A bare icon on a dark or light canvas needs a colour that reads on both: the icon's own, unless the code or kind chose one.
    const glyph = isIcon && !node.color && !KIND_COLORS[node.kind] ? iconForNode({ icon: node.icon, semanticKind: node.kind }) : null;
    const element = {
      id: `${document.metadata.generationId}-${node.id}`,
      type: shape && isOutlineVariantId(shape) ? "outline" : ((structuredType ? "semantic-node" : (shape ?? "semantic-node")) as "diamond" | "pill" | "icon" | "semantic-node"),
      ...(shape && isOutlineVariantId(shape)
        ? { variant: shape, ...(node.border ? { border: node.border } : {}), ...(node.marker ? { marker: node.marker } : {}), ...(node.stack ? { stack: true } : {}) }
        : {}),
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      color: glyph ? (glyph.color ?? categoryTint(glyph.category)) : style.stroke,
      strokeWidth: importance >= 8 ? 3 : 2,
      // A bare icon has no box to fill.
      ...(isIcon ? {} : { fill: style.fill }),
      // A step with no icon and no kind would otherwise show the placeholder cube: let its label have the whole box.
      ...(!shape && (node.stack || (!node.icon && node.kind === "generic"))
        ? { nodeStyle: { ...(!node.icon && node.kind === "generic" ? { iconHidden: true } : {}), ...(node.stack ? { stack: true } : {}) } }
        : {}),
      label: node.label,
      fontSize: isIcon ? ICON_NODE_FONT_SIZE : NODE_FONT_SIZE,
      fontWeight: NODE_FONT_WEIGHT,
      ai: {
        frameId,
        generationId: document.metadata.generationId,
        semanticId: node.id,
        semanticKind: node.kind,
        ...(node.icon ? { icon: node.icon } : {}),
        diagramType: document.diagramType,
        ...(codeDirectionOf(document.layoutHints.direction) ? { diagramDirection: codeDirectionOf(document.layoutHints.direction)! } : {}),
        role: "node",
      },
    } as DrawingElement;
    const placed = structuredType ? structuredElement(element, node, structuredType, mind, document) : element;
    nodeElements.push(placed);
    positionedByNodeId.set(node.id, { node, element: placed, bounds, depth });
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
    /** Position along its side (0 to 1) when the connector has its own point there, else it uses the middle. */
    fromPort?: number;
    toPort?: number;
    sourceElementId: string;
    targetElementId: string;
    bidirectional: boolean;
    dashed: boolean;
    plain: boolean;
    color?: string;
    relation?: ConnectorRelation;
  }> = [];

  const usedHandlePairs = new Map<string, number>();
  const outDegree = new Map<string, number>();
  document.edges.forEach((edge) => outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1));
  const usedOutHandles = new Set<string>();
  // First every connector's sides, then the points on those sides: a side that several connectors share
  // is spread (see `spreadPorts`), so the points can only be chosen once all sides are known.
  const pending: Array<{
    edge: (typeof document.edges)[number];
    index: number;
    source: PositionedNode;
    target: PositionedNode;
    handles: { from: ConnectionHandle; to: ConnectionHandle };
  }> = [];
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
    const automatic = spreadParallelEdges(base, source, target, usedHandlePairs);
    // Sides: chosen by an explicit override (the builder), else by the code (`from:` / `to:`), else automatically.
    const handles =
      edgeSides?.get(`${edge.from}>${edge.to}`) ??
      (edge.fromSide || edge.toSide ? { from: edge.fromSide ?? automatic.from, to: edge.toSide ?? automatic.to } : automatic);
    pending.push({ edge, index, source, target, handles });
  });

  const style = connector ?? profileFor(document.diagramType).connector;
  const ports = spread
    ? spreadPorts(pending.map(({ source, target, handles }) => ({ source, target, handles })))
    : pending.map(() => ({} as { from?: number; to?: number }));
  const straightEdges = new Set<number>();
  // Messages between lifelines sit at their own height on both, in the order they are written.
  const messages = pending.map((p, i) => ({ p, i })).filter(({ p }) => p.source.element.type === "lifeline" && p.target.element.type === "lifeline");
  messages.forEach(({ i }, k) => {
    const at = (k + 1) / (messages.length + 1);
    ports[i] = { from: at, to: at };
    // A message runs level from the side of one body that faces the other.
    const rightward = pending[i].target.bounds.minX >= pending[i].source.bounds.minX;
    pending[i].handles = { from: rightward ? "right" : "left", to: rightward ? "left" : "right" };
    straightEdges.add(i);
  });
  // A mind-map branch leaves its topic on the side that faces the child, so the lines spread out like spokes.
  pending.forEach((p) => {
    if (p.source.element.type !== "mindmap-node" || p.target.element.type !== "mindmap-node") return;
    const dx = (p.target.bounds.minX + p.target.bounds.maxX - p.source.bounds.minX - p.source.bounds.maxX) / 2;
    const dy = (p.target.bounds.minY + p.target.bounds.maxY - p.source.bounds.minY - p.source.bounds.maxY) / 2;
    p.handles = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx > 0 ? { from: "right", to: "left" } : { from: "left", to: "right" }) : dy > 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
  });
  pending.forEach(({ edge, index, source, target, handles }, i) => {
    // A mind-map branch is a plain line in its branch's colour, straight from topic to topic.
    const branch = source.element.type === "mindmap-node" && target.element.type === "mindmap-node";
    if (branch) straightEdges.add(i);
    const fromPort = ports[i].from;
    const toPort = ports[i].to;
    const start = fromPort ? portPoint(source.bounds, handles.from, fromPort) : getConnectionHandlePoint(source.bounds, handles.from);
    const end = toPort ? portPoint(target.bounds, handles.to, toPort) : getConnectionHandlePoint(target.bounds, handles.to);
    const edgeId = `${document.metadata.generationId}-${edge.id || `edge-${index + 1}`}`;
    arrowDrafts.push({
      edgeId,
      label: edge.label?.trim() || undefined,
      fromHandle: handles.from,
      toHandle: handles.to,
      fromPort,
      toPort,
      sourceElementId: source.element.id,
      targetElementId: target.element.id,
      bidirectional: Boolean(edge.bidirectional),
      dashed: Boolean(edge.dashed),
      plain: Boolean(edge.plain) || branch,
      color: edge.color ?? (branch ? (target.element as { branchColor?: string }).branchColor : undefined),
      relation: normalizeRelation(edge.relation),
      descriptor: {
        arrowId: edgeId,
        sourceId: source.element.id,
        targetId: target.element.id,
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        startHandle: handles.from,
        endHandle: handles.to,
        routingMode: style === "straight" || straightEdges.has(i) ? "straight" : "orthogonal",
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
  // Connectors of tables and classes are not merged into shared buses: a crow's foot on a shared line says nothing about which table it belongs to.
  const tableIds = new Set(Array.from(positionedByNodeId.values()).filter((p) => TABLE_TYPES.has(p.element.type) || p.element.type === "mindmap-node").map((p) => p.element.id));
  const bundled = bundleFans(
    arrowDrafts.filter((draft) => !tableIds.has(draft.sourceElementId) && !tableIds.has(draft.targetElementId)).map((draft) => ({
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
    const points = bundled.get(draft.edgeId) ?? routed.get(draft.edgeId) ?? [draft.descriptor.start, draft.descriptor.end];
    paths.set(draft.edgeId, points);
    elements.push({
      id: draft.edgeId,
      type: draft.bidirectional ? "arrow-bidirectional" : "arrow",
      points,
      // Black and white by theme unless the code or the user chose a colour.
      color: draft.color ?? "#000000",
      strokeWidth: 2,
      dashed: draft.dashed,
      arrowHeadStart: draft.bidirectional && !draft.plain,
      arrowHeadEnd: !draft.plain,
      // Stored only when the code gave the connection a meaning; it then decides the line style and the heads.
      ...(draft.relation ? { relation: draft.relation } : {}),
      routingMode: style === "straight" || draft.descriptor.routingMode === "straight" ? "straight" : style === "curved" ? "curved" : "orthogonal",
      ...(style === "elbow" && draft.descriptor.routingMode !== "straight" ? { cornerRadius: DEFAULT_ARROW_CORNER_RADIUS } : {}),
      routePreference: draft.descriptor.routePreference,
      isManuallyRouted: false,
      startConnection: {
        elementId: draft.sourceElementId,
        anchorId: draft.fromPort !== undefined ? portAnchorId(draft.sourceElementId, draft.fromHandle, draft.fromPort) : buildAnchorId(draft.sourceElementId, draft.fromHandle),
      },
      endConnection: {
        elementId: draft.targetElementId,
        anchorId: draft.toPort !== undefined ? portAnchorId(draft.targetElementId, draft.toHandle, draft.toPort) : buildAnchorId(draft.targetElementId, draft.toHandle),
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

  // Headings next to the routed connectors: a connector entering a group must not run through its name.
  const headingSpots = placeGroupHeadings(frames.headings, Array.from(paths.values()), (id, grown) => {
    // A frame may grow to make room for its name unless that would cover a node that is not in it or cut into another frame.
    const own = frames.headings.find((h) => h.id === id)!;
    const memberIds = frames.members.get(id) ?? new Set<string>();
    const coversStranger = [...positionedByNodeId.values()].some((p) => !memberIds.has(p.node.id) && intersects(grown, p.bounds));
    const cutsFrame = frames.headings.some((h) => h.id !== id && intersects(grown, h.frame) && !contains(h.frame, grown) && !contains(grown, h.frame));
    return !coversStranger && !cutsFrame && grown.maxX >= own.frame.maxX;
  });
  for (const element of frames.elements) {
    const label = headingSpots.get(element.id);
    if (label) element.points = [{ x: label.x, y: label.y }];
    // A frame that grew: the rectangle is the element named like its heading, without the suffix.
    const grewFor = headingSpots.get(`${element.id}-label`);
    if (grewFor?.frameMaxX !== undefined && element.ai?.role === "group") element.points = [element.points[0], { x: grewFor.frameMaxX, y: element.points[1].y }];
  }
  const titleBoxes: Box[] = frames.headings.map((h) => {
    const spot = headingSpots.get(h.id)!;
    return { minX: spot.x, minY: spot.y, maxX: spot.x + h.width, maxY: spot.y + h.height };
  });

  // Labels go last: they need the routed paths, the nodes and the frame titles to stay clear of.
  const labelDrafts = arrowDrafts.filter((draft) => draft.label);
  const placed = placeEdgeLabels(
    labelDrafts.map((draft) => ({ id: draft.edgeId, text: draft.label!, points: paths.get(draft.edgeId)! })),
    [...Array.from(positionedByNodeId.values()).map((p) => p.bounds), ...titleBoxes],
    paths,
  );
  const labelElements: DrawingElement[] = placed.map((label) => {
    const draft = labelDrafts.find((d) => d.edgeId === label.id)!;
    return {
      id: `${draft.edgeId}-label`,
      type: "text",
      points: [label.position],
      color: "#000000",
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

/** Sides a connection must use, keyed by `fromNodeId>toNodeId`. */
export type EdgeSides = Map<string, { from: ConnectionHandle; to: ConnectionHandle }>;

export interface CompileOptions {
  engine?: PlacementEngine;
  /** Nodes (by diagram node id) moved relative to their automatic place; they keep that offset as the diagram grows. */
  offsets?: Map<string, NodeOffset>;
  /** Connections whose sides were chosen explicitly instead of by the compiler. */
  edgeSides?: EdgeSides;
  /** Nodes (by diagram node id) that must keep their centre; everything else is laid out around them. */
  pins?: Map<string, NodePin>;
  /** False draws every connector on the middle of its side (the compiler otherwise also tries separate points and keeps the better drawing). */
  spreadPorts?: boolean;
  /** Give rows that many (or labelled) connectors cross a wider gap. For drawings generated from scratch; editing an existing one leaves its spacing alone. */
  channelGaps?: boolean;
  /** How connectors are drawn; the caller's choice beats the diagram profile's. */
  connectors?: ConnectorStyle;
  /** Force one way of putting nodes in rows instead of trying the candidates and keeping the best (an engine algorithm names one). */
  depthMode?: DepthMode;
}

const compileWith = (
  document: AIDiagramDocumentV1,
  frameId: string,
  mode: DepthMode,
  { engine = placeLayered, pins, offsets, edgeSides, spreadPorts: spread, channelGaps, connectors }: CompileOptions,
): CompileResult => {
  const prepared = prepareDiagram(document, mode, channelGaps === true);
  const directed = withDirection(engine, document.layoutHints.direction);
  const offsetEngine = offsets && offsets.size > 0 ? withOffsets(directed, offsets) : directed;
  // Nodes whose code gives x and y sit exactly there (x, y is the top-left corner); the rest are laid out around them.
  const fixed = new Map(pins ?? []);
  for (const node of document.nodes) {
    const size = prepared.sizes.get(node.id);
    if (node.x !== undefined && node.y !== undefined && size) fixed.set(node.id, { x: node.x + size.width / 2, y: node.y + size.height / 2 });
  }
  const place = fixed.size > 0 ? withPins(offsetEngine, fixed) : offsetEngine;
  let placement: Placement;
  let layoutFallback: string | undefined;
  try {
    placement = place(prepared.input);
  } catch (error) {
    // A layout bug must cost the diagram its tidiness, not the whole generation.
    layoutFallback = error instanceof Error ? error.message : String(error);
    placement = placeGrid(prepared.input);
  }
  const result = buildCanvas(document, frameId, prepared, placement, edgeSides, spread !== false, connectors);
  return layoutFallback ? { ...result, diagnostics: { ...result.diagnostics, layoutFallback } } : result;
};

/**
 * Lower is better, compared in this order: what is plainly broken (overlapping nodes, a group frame that
 * is wrong, a label on top of something, a connector through a node), then shared lines, crossings and
 * connector length.
 */
const layoutCost = (result: CompileResult, document: AIDiagramDocumentV1): [number, number] => {
  const m = measureLayout(result.elements, document.groups);
  const broken = m.nodeOverlaps + m.groupViolations + m.groupsDropped + m.labelsColliding + m.edgeThroughNodes;
  return [broken, m.edgeOverlaps * 20_000 + m.edgeCrossings * 2_000 + m.totalEdgeLength];
};

const cheaper = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

export const compileAIDiagramDetailed = (
  document: AIDiagramDocumentV1,
  frameId: string,
  options: CompileOptions = {},
): CompileResult => {
  // An architecture can also be laid out by its flow, and a diagram with several groups with each group
  // on its own rows ("stacked"); keep whichever the measurements prefer. Ties keep the earlier one.
  const modes: DepthMode[] = options.depthMode ? [options.depthMode] : ["layers"];
  if (!options.depthMode && document.diagramType === "architecture" && document.nodes.length >= 2) modes.push("flow");
  if (!options.depthMode && document.groups.length >= 2) modes.push("stacked");
  // Connectors that share a side are given separate points (`spreadPorts`); where that makes the drawing
  // worse by the same measure, the middle-of-side drawing is kept instead.
  // Topics are sized by their place in the tree (the centre is larger), which only the whole diagram knows.
  if (document.nodes.some((n) => n.shape === "topic")) {
    const mind = mindmapRoles(document);
    document = { ...document, nodes: document.nodes.map((n) => (n.shape === "topic" ? { ...n, data: { ...n.data, mindRole: mind.role(n.id) } } : n)) };
  }
  const compileMode = (mode: DepthMode): CompileResult => {
    const spread = compileWith(document, frameId, mode, options);
    if (options.spreadPorts === false || document.edges.length < 2) return spread;
    const plain = compileWith(document, frameId, mode, { ...options, spreadPorts: false });
    return cheaper(layoutCost(plain, document), layoutCost(spread, document)) ? plain : spread;
  };
  let best = compileMode(modes[0]);
  if (modes.length === 1) return best;
  let bestCost = layoutCost(best, document);
  for (const mode of modes.slice(1)) {
    const candidate = compileMode(mode);
    const cost = layoutCost(candidate, document);
    // Stacked rows are a repair for what is broken (a dropped frame); on soft measures alone they are not preferred.
    const better = mode === "stacked" ? cost[0] < bestCost[0] : cheaper(cost, bestCost);
    if (better) [best, bestCost] = [candidate, cost];
  }
  return best;
};

export const compileAIDiagramToCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
  options: CompileOptions = {},
): DrawingElement[] => compileAIDiagramDetailed(document, frameId, options).elements;


/** A node's element, turned into its structured form: the content comes from the node's data, the look (colours, points) stays what was computed. */
const structuredElement = (
  element: DrawingElement,
  node: AIDiagramNode,
  type: DrawingElement["type"],
  mind: ReturnType<typeof mindmapRoles>,
  document: AIDiagramDocumentV1,
): DrawingElement => {
  const { label, nodeStyle, ...rest } = element as DrawingElement & { nodeStyle?: unknown };
  void nodeStyle;
  const data = node.data ?? {};
  if (type === "entity-table") return { ...rest, type, name: node.label, ...(data.variant ? { kind: data.variant } : {}), rows: parseRows(data.rows) } as unknown as DrawingElement;
  if (type === "uml-classifier") {
    const attrs = splitMembers(data.attributes), ops = splitMembers(data.operations);
    return { ...rest, type, name: node.label, ...(data.variant ? { kind: data.variant } : {}), ...(data.stereotype ? { stereotype: data.stereotype } : {}), ...(data.template ? { template: data.template } : {}), ...(attrs.length ? { attributes: attrs } : {}), ...(ops.length ? { operations: ops } : {}) } as unknown as DrawingElement;
  }
  if (type === "mindmap-node") {
    const color = mind.colorOf(node.id);
    const parentId = mind.parent.get(node.id);
    return { ...rest, label, type, role: mind.role(node.id), ...(parentId ? { parentId: `${document.metadata.generationId}-${parentId}` } : {}), ...(color ? { branchColor: color } : {}) } as unknown as DrawingElement;
  }
  return { ...rest, type, name: node.label } as unknown as DrawingElement;
};

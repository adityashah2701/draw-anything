import { buildAnchorId } from "@/core/anchors/generate-anchors";
import {
  assignCenters,
  orderRows,
  type LayoutEdge,
  type LayoutNode,
} from "@/features/ai/server/layout/layered-order";
import { getConnectionHandlePoint } from "@/core/routing/connection-handles";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import { estimateLabelBox, estimateTextWidth } from "@/core/text/estimate";
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
  decision: { fill: "#ffe4e6", stroke: "#be123c" },
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
// Space the node renderer keeps beside the label: icon (28) + gaps (38).
const NODE_LABEL_INSET = 66;

const estimateWidth = (label: string, density: string) => {
  const adjust = density === "compact" ? -18 : density === "spacious" ? 22 : 0;
  const { width } = estimateLabelBox({
    label,
    fontSize: NODE_FONT_SIZE,
    fontWeight: "600",
    maxLines: 1,
    minWidth: 168,
    maxWidth: 280,
    insetWidth: NODE_LABEL_INSET,
  });
  return Math.min(280, Math.max(168, width + adjust));
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

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  document.nodes.forEach((node) => {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  });
  document.edges.forEach((edge) => {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) return;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  });
  const depth = new Map(document.nodes.map((node) => [node.id, 0]));
  const queue = document.nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    seen.add(id);
    outgoing.get(id)?.forEach((next) => {
      depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1));
      incoming.set(next, (incoming.get(next) ?? 0) - 1);
      if ((incoming.get(next) ?? 0) === 0) queue.push(next);
    });
  }
  document.nodes.forEach((node, index) => {
    if (!seen.has(node.id)) depth.set(node.id, Math.floor(index / 4));
  });
  return depth;
};

const chooseHandles = (
  source: PositionedNode,
  target: PositionedNode,
): { from: ConnectionHandle; to: ConnectionHandle } => {
  if (target.depth > source.depth) return { from: "bottom", to: "top" };
  if (target.depth < source.depth) return { from: "top", to: "bottom" };
  if (target.bounds.minX >= source.bounds.minX) return { from: "right", to: "left" };
  return { from: "left", to: "right" };
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

const FRAME_PADDING = 20;
const FRAME_NEST_STEP = 16;
const FRAME_TITLE_HEIGHT = 22;

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
    minY: Math.min(...members.map((m) => m.bounds.minY)) - pad - FRAME_TITLE_HEIGHT,
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
): DrawingElement[] => {
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

  return accepted.flatMap(({ box, bounds }) => {
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
};

// ── Edge labels ───────────────────────────────────────────────────────────

const EDGE_LABEL_FONT_SIZE = 13;

/** Put the label on the longest segment: above a horizontal one, beside a vertical one. */
const edgeLabelPosition = (points: Point[], label: string): Point | null => {
  let best: { from: Point; to: Point; length: number } | null = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (length > 0 && (!best || length > best.length)) {
      best = { from: points[i], to: points[i + 1], length };
    }
  }
  if (!best) return null;
  const midX = (best.from.x + best.to.x) / 2;
  const midY = (best.from.y + best.to.y) / 2;
  const width = Math.ceil(estimateTextWidth(label, EDGE_LABEL_FONT_SIZE, "500"));
  const horizontal = Math.abs(best.to.y - best.from.y) < Math.abs(best.to.x - best.from.x);
  // Text elements are as tall as their line box, not their font size.
  const textHeight = EDGE_LABEL_FONT_SIZE * LINE_HEIGHT_RATIO;
  return horizontal
    ? { x: midX - width / 2, y: midY - textHeight - 4 }
    : { x: midX + 8, y: midY - textHeight / 2 };
};

// ── Compile ───────────────────────────────────────────────────────────────

export const compileAIDiagramToCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
): DrawingElement[] => {
  const depthByNodeId = getDepths(document);
  const density = document.styleHints.density;
  const groups = usableGroups(
    document,
    // sizes are not known yet; membership alone decides whether groups exist
    new Map(document.nodes.map((node) => [node.id, { node } as PositionedNode])),
  );
  const maxNesting = Math.max(0, ...nestingDepths(groups).map((g) => g.depth));
  const frameRoom = groups.length > 0 ? 40 + maxNesting * FRAME_NEST_STEP : 0;
  const horizontalGap =
    (density === "compact" ? 52 : density === "spacious" ? 112 : 78) + frameRoom / 2;
  const verticalGap =
    (density === "compact" ? 112 : density === "spacious" ? 168 : 138) + frameRoom;

  // Nodes ordered as before (column hint, then label) as the starting point.
  const ordered = [...document.nodes].sort((a, b) => {
    const ac = a.column ?? Number.MAX_SAFE_INTEGER;
    const bc = b.column ?? Number.MAX_SAFE_INTEGER;
    return ac - bc || a.label.localeCompare(b.label);
  });

  // The outermost group a node belongs to keeps its members side by side.
  const clusterOf = new Map<string, string>();
  [...groups].forEach(({ group, members }) =>
    members.forEach((m) => {
      if (!clusterOf.has(m.node.id)) clusterOf.set(m.node.id, group.id);
    }),
  );

  const layoutNodes: LayoutNode[] = ordered.map((node) => ({
    id: node.id,
    depth: depthByNodeId.get(node.id) ?? 0,
    width: estimateWidth(node.label, density),
    cluster: clusterOf.get(node.id),
  }));
  const knownIds = new Set(layoutNodes.map((n) => n.id));
  const layoutEdges: LayoutEdge[] = document.edges
    .filter((edge) => knownIds.has(edge.from) && knownIds.has(edge.to))
    .map((edge) => ({ from: edge.from, to: edge.to }));

  const rows = orderRows(layoutNodes, layoutEdges);
  const centers = assignCenters(rows, layoutNodes, layoutEdges, {
    gap: horizontalGap,
    centerX: 960,
  });

  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const widthById = new Map(layoutNodes.map((n) => [n.id, n.width]));
  const positionedByNodeId = new Map<string, PositionedNode>();
  const nodeElements: DrawingElement[] = [];

  rows.forEach((ids, depth) => {
    const y = 150 + depth * verticalGap;
    ids.forEach((id) => {
      const node = nodeById.get(id)!;
      const width = widthById.get(id)!;
      const height = node.kind === "decision" ? 92 : 78;
      const x = (centers.get(id) ?? 960) - width / 2;
      const style = KIND_COLORS[node.kind] ?? {
        fill: depth % 2 === 0 ? "#f8fafc" : "#eef2ff",
        stroke: "#1f2937",
      };
      const importance =
        document.visualImportance.find((entry) => entry.nodeId === node.id)?.score ?? 5;
      const bounds: Bounds = {
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height,
        width,
        height,
      };
      const element: DrawingElement = {
        id: `${document.metadata.generationId}-${node.id}`,
        type: "semantic-node",
        points: [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
        ],
        color: style.stroke,
        strokeWidth: importance >= 8 ? 3 : 2,
        fill: style.fill,
        label: node.label,
        fontSize: NODE_FONT_SIZE,
        fontWeight: "600",
        ai: {
          frameId,
          generationId: document.metadata.generationId,
          semanticId: node.id,
          semanticKind: node.kind,
          diagramType: document.diagramType,
          role: "node",
        },
      };
      nodeElements.push(element);
      positionedByNodeId.set(node.id, { node, element, bounds, depth });
    });
  });

  const groupElements = buildGroupFrames(document, positionedByNodeId, frameId);
  const elements: DrawingElement[] = [...groupElements, ...nodeElements];

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
  }> = [];

  document.edges.forEach((edge, index) => {
    const source = positionedByNodeId.get(edge.from);
    const target = positionedByNodeId.get(edge.to);
    if (!source || !target) return;
    const handles = chooseHandles(source, target);
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

  const labelElements: DrawingElement[] = [];
  arrowDrafts.forEach((draft) => {
    const points =
      routed.get(draft.edgeId) ?? [draft.descriptor.start, draft.descriptor.end];
    elements.push({
      id: draft.edgeId,
      type: draft.bidirectional ? "arrow-bidirectional" : "arrow",
      points,
      color: "#64748b",
      strokeWidth: 2,
      dashed: draft.dashed,
      arrowHeadStart: draft.bidirectional,
      arrowHeadEnd: true,
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

    if (draft.label) {
      const position = edgeLabelPosition(points, draft.label);
      if (position) {
        labelElements.push({
          id: `${draft.edgeId}-label`,
          type: "text",
          points: [position],
          color: "#475569",
          strokeWidth: 1,
          text: draft.label,
          fontSize: EDGE_LABEL_FONT_SIZE,
          fontWeight: "500",
          fontStyle: "normal",
          isGuide: true,
          ai: {
            frameId,
            generationId: document.metadata.generationId,
            semanticId: `${draft.edgeId}-label`,
            diagramType: document.diagramType,
            role: "edge-label",
          },
        });
      }
    }
  });

  return [...elements, ...labelElements];
};

import { buildAnchorId } from "@/core/anchors/generate-anchors";
import { getConnectionHandlePoint } from "@/core/routing/connection-handles";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import {
  AIDiagramDocumentV1,
  AIDiagramNode,
} from "@/features/ai/types";
import {
  Bounds,
  ConnectionHandle,
  DrawingElement,
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

const estimateWidth = (label: string, density: string) => {
  const longestWord = label
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 0);
  const compactness = density === "compact" ? -18 : density === "spacious" ? 22 : 0;
  return Math.min(280, Math.max(168, 172 + longestWord * 4 + compactness));
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

export const compileAIDiagramToCanvas = (
  document: AIDiagramDocumentV1,
  frameId: string,
): DrawingElement[] => {
  const depthByNodeId = getDepths(document);
  const density = document.styleHints.density;
  const horizontalGap = density === "compact" ? 52 : density === "spacious" ? 112 : 78;
  const verticalGap = density === "compact" ? 112 : density === "spacious" ? 168 : 138;
  const positionedByNodeId = new Map<string, PositionedNode>();
  const elements: DrawingElement[] = [];
  const nodesByDepth = new Map<number, AIDiagramNode[]>();

  document.nodes.forEach((node) => {
    const depth = depthByNodeId.get(node.id) ?? 0;
    if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, []);
    nodesByDepth.get(depth)!.push(node);
  });

  Array.from(nodesByDepth.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([depth, nodes]) => {
      const ordered = [...nodes].sort((a, b) => {
        const ac = a.column ?? Number.MAX_SAFE_INTEGER;
        const bc = b.column ?? Number.MAX_SAFE_INTEGER;
        if (ac !== bc) return ac - bc;
        return a.label.localeCompare(b.label);
      });
      const sizes = ordered.map((node) => ({
        node,
        width: estimateWidth(node.label, density),
        height: node.kind === "decision" ? 92 : 78,
      }));
      const rowWidth =
        sizes.reduce((sum, size) => sum + size.width, 0) +
        Math.max(0, sizes.length - 1) * horizontalGap;
      let x = 960 - rowWidth / 2;
      const y = 150 + depth * verticalGap;
      sizes.forEach(({ node, width, height }) => {
        const style = KIND_COLORS[node.kind] ?? {
          fill: depth % 2 === 0 ? "#f8fafc" : "#eef2ff",
          stroke: "#1f2937",
        };
        const importance =
          document.visualImportance.find((entry) => entry.nodeId === node.id)?.score ?? 5;
        const id = `${document.metadata.generationId}-${node.id}`;
        const bounds: Bounds = {
          minX: x,
          minY: y,
          maxX: x + width,
          maxY: y + height,
          width,
          height,
        };
        const element: DrawingElement = {
          id,
          type: "semantic-node",
          points: [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
          ],
          color: style.stroke,
          strokeWidth: importance >= 8 ? 3 : 2,
          fill: style.fill,
          label: node.label,
          fontSize: 17,
          fontWeight: "600",
          ai: {
            frameId,
            generationId: document.metadata.generationId,
            semanticId: node.id,
            semanticKind: node.kind,
            diagramType: document.diagramType,
          },
        };
        elements.push(element);
        positionedByNodeId.set(node.id, { node, element, bounds, depth });
        x += width + horizontalGap;
      });
    });

  const obstacles = Array.from(positionedByNodeId.values()).map(asObstacle);
  const arrowDrafts: Array<{
    edgeId: string;
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
      },
    });
  });

  return elements;
};

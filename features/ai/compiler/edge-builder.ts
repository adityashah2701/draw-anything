import { buildAnchorId } from "@/core/anchors/generate-anchors";
import { placeEdgeLabels, EDGE_LABEL_FONT_SIZE, EDGE_LABEL_FONT_WEIGHT } from "@/features/ai/layout/edge-labels";
import { bundleFans } from "@/features/ai/layout/bus";
import { DEFAULT_ARROW_CORNER_RADIUS } from "@/core/shapes/arrow/corner-radius";
import { portAnchorId, portPoint, spreadFractions } from "@/core/anchors/ports";
import { profileFor, type ConnectorStyle } from "@/features/ai/diagram-agent/profiles";
import {
  chooseHandles,
  decisionExitHandle,
  spreadParallelEdges,
} from "@/features/ai/layout/handle-selection";
import { getConnectionHandlePoint } from "@/core/routing/connection-handles";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import { normalizeRelation } from "@/core/shapes/arrow/relations";
import type {
  AIDiagramDocumentV1,
  AIDiagramNode,
} from "@/features/ai/types";
import type {
  ConnectionHandle,
  ConnectorRelation,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import type { Box } from "@/features/ai/layout/geometry";
import type { HeadingRequest } from "@/features/ai/layout/group-headings";
import type { PositionedNode } from "./node-factory";
import { adjustGroupHeadings } from "./frame-builder";

export const tableStem = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ies|es|s)$/, "");

export const refersTo = (node: AIDiagramNode, other: AIDiagramNode) =>
  [...(node.data?.rows ?? "").matchAll(/(?:->|references)\s*(\w+)/gi)].some((m) => [other.label, other.id].some((name) => tableStem(m[1]) === tableStem(name)));

/** The parent end of a connection between two tables, from their foreign keys: the table that references the other is the child. */
export const foreignKeyParent = (from: AIDiagramNode | undefined, to: AIDiagramNode | undefined): "from" | "to" | undefined => {
  if (!from || !to || from.shape !== "entity" || to.shape !== "entity") return undefined;
  const fromRefs = refersTo(from, to), toRefs = refersTo(to, from);
  return fromRefs && !toRefs ? "to" : toRefs && !fromRefs ? "from" : undefined;
};

export const TABLE_TYPES: ReadonlySet<string> = new Set(["entity-table", "uml-classifier"]);

export const spreadPorts = (
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

export type EdgeSides = Map<string, { from: ConnectionHandle; to: ConnectionHandle }>;

export interface BuildEdgesInput {
  document: AIDiagramDocumentV1;
  positionedByNodeId: Map<string, PositionedNode>;
  frameId: string;
  edgeSides?: EdgeSides;
  spread: boolean;
  connector?: ConnectorStyle;
  titleBoxes?: Box[];
  frames?: { headings: HeadingRequest[]; elements: DrawingElement[]; members: Map<string, Set<string>> };
}

export interface BuildEdgesOutput {
  edgeElements: DrawingElement[];
  labelElements: DrawingElement[];
  paths: Map<string, Point[]>;
  collidingLabels: string[];
}

export const buildEdgeElements = ({
  document,
  positionedByNodeId,
  frameId,
  edgeSides,
  spread,
  connector,
  titleBoxes,
  frames,
}: BuildEdgesInput): BuildEdgesOutput => {
  const obstacles: RoutingObstacle[] = Array.from(positionedByNodeId.values()).map((positioned) => ({
    id: positioned.element.id,
    bounds: {
      minX: positioned.bounds.minX,
      minY: positioned.bounds.minY,
      maxX: positioned.bounds.maxX,
      maxY: positioned.bounds.maxY,
    },
  }));

  const arrowDrafts: Array<{
    edgeId: string;
    label?: string;
    descriptor: RouteArrowDescriptor;
    fromHandle: ConnectionHandle;
    toHandle: ConnectionHandle;
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

  const messages = pending.map((p, i) => ({ p, i })).filter(({ p }) => p.source.element.type === "lifeline" && p.target.element.type === "lifeline");
  messages.forEach(({ i }, k) => {
    const at = (k + 1) / (messages.length + 1);
    ports[i] = { from: at, to: at };
    const rightward = pending[i].target.bounds.minX >= pending[i].source.bounds.minX;
    pending[i].handles = { from: rightward ? "right" : "left", to: rightward ? "left" : "right" };
    straightEdges.add(i);
  });

  pending.forEach((p) => {
    if (p.source.element.type !== "mindmap-node" || p.target.element.type !== "mindmap-node") return;
    const dx = (p.target.bounds.minX + p.target.bounds.maxX - p.source.bounds.minX - p.source.bounds.maxX) / 2;
    const dy = (p.target.bounds.minY + p.target.bounds.maxY - p.source.bounds.minY - p.source.bounds.maxY) / 2;
    p.handles = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx > 0 ? { from: "right", to: "left" } : { from: "left", to: "right" }) : dy > 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
  });

  pending.forEach(({ edge, index, source, target, handles }, i) => {
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
  const edgeElements: DrawingElement[] = [];

  arrowDrafts.forEach((draft) => {
    const points = bundled.get(draft.edgeId) ?? routed.get(draft.edgeId) ?? [draft.descriptor.start, draft.descriptor.end];
    paths.set(draft.edgeId, points);
    edgeElements.push({
      id: draft.edgeId,
      type: draft.bidirectional ? "arrow-bidirectional" : "arrow",
      points,
      color: draft.color ?? "#000000",
      strokeWidth: 2,
      dashed: draft.dashed,
      arrowHeadStart: draft.bidirectional && !draft.plain,
      arrowHeadEnd: !draft.plain,
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

  const actualTitleBoxes: Box[] = titleBoxes ?? (frames ? adjustGroupHeadings(frames, paths, positionedByNodeId) : []);
  const labelDrafts = arrowDrafts.filter((draft) => draft.label);
  const placed = placeEdgeLabels(
    labelDrafts.map((draft) => ({ id: draft.edgeId, text: draft.label!, points: paths.get(draft.edgeId)! })),
    [...Array.from(positionedByNodeId.values()).map((p) => p.bounds), ...actualTitleBoxes],
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
    edgeElements,
    labelElements,
    paths,
    collidingLabels: placed.filter((p) => p.collides).map((p) => p.id),
  };
};

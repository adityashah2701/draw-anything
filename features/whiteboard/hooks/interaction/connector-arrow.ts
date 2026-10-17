import type {
  AnchorSide,
  ArrowShape,
  DrawingElement,
} from "@/features/whiteboard/types/whiteboard.types";
import { routeArrowPoints } from "@/core/routing/orthogonal-router";
import { createShape } from "@/core/shapes/shape-runtime";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";

export interface ConnectorEnd {
  elementId: string;
  anchorId: string;
  x: number;
  y: number;
  side: AnchorSide;
}

/**
 * The arrow created when a connector handle is dropped on another shape.
 *
 * Its first path comes from the router with no obstacles, so on its own it can
 * cut straight through unrelated shapes. `route` (the same obstacle-aware
 * router arrows drawn with the arrow tool go through) replaces that path; if
 * it fails, the plain path is kept rather than losing the connection.
 */
export const buildConnectorArrow = ({
  id,
  from,
  to,
  route,
}: {
  id: string;
  from: ConnectorEnd;
  to: ConnectorEnd;
  route?: (arrow: DrawingElement) => DrawingElement | undefined;
}): ArrowShape | null => {
  const arrow = createShape("arrow", {
    id,
    points: routeArrowPoints({
      start: { x: from.x, y: from.y },
      end: { x: to.x, y: to.y },
      startHandle: from.side,
      endHandle: to.side,
      routingMode: "orthogonal",
    }),
    color: "#475569",
    strokeWidth: 2,
    routingMode: "orthogonal",
    isManuallyRouted: false,
    arrowHeadStart: false,
    arrowHeadEnd: true,
    startConnection: { elementId: from.elementId, anchorId: from.anchorId },
    endConnection: { elementId: to.elementId, anchorId: to.anchorId },
  });
  if (!arrow || !isArrowElement(arrow)) return null;
  if (!route) return arrow as ArrowShape;

  try {
    const routed = route(arrow);
    if (routed && isArrowElement(routed) && routed.points?.length >= 2) {
      return routed as ArrowShape;
    }
  } catch {
    // Fall through to the unrouted path.
  }
  return arrow as ArrowShape;
};

export interface HandlePoint {
  id: string;
  name: AnchorSide;
  x: number;
  y: number;
}

export interface ConnectionDraftLike {
  fromElementId: string;
  fromAnchorId: string;
  fromHandle: AnchorSide;
  currentPoint: { x: number; y: number };
}

/** The handle within `radius` of `point`, first in list order. */
export const handleUnderPoint = (handles: readonly HandlePoint[], point: { x: number; y: number }, radius: number) =>
  handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= radius) ?? null;

/**
 * Both ends of the connector a handle drag creates when it is dropped, or null when the drop is not on a
 * connectable shape. `candidates` are the shapes under the drop (the snapped shape when there is one),
 * topmost last; the end lands on the snapped anchor, else the handle nearest the pointer.
 */
export const resolveConnectionDrop = ({
  draft,
  elements,
  candidates,
  snapAnchor,
  getHandles,
}: {
  draft: ConnectionDraftLike;
  elements: readonly DrawingElement[];
  candidates: readonly DrawingElement[];
  snapAnchor: HandlePoint | null;
  getHandles: (element: DrawingElement) => HandlePoint[];
}): { from: ConnectorEnd; to: ConnectorEnd } | null => {
  const target = [...candidates]
    .reverse()
    .find((element) => element.id !== draft.fromElementId && getHandles(element).length > 0);
  const source = elements.find((el) => el.id === draft.fromElementId);
  if (!target || !source) return null;

  const fromHandle = getHandles(source).find((h) => h.name === draft.fromHandle);
  const toHandles = snapAnchor ? [snapAnchor] : getHandles(target);
  let nearest = toHandles[0];
  let best = Infinity;
  for (const handle of toHandles) {
    const distance = Math.hypot(draft.currentPoint.x - handle.x, draft.currentPoint.y - handle.y);
    if (distance < best) {
      best = distance;
      nearest = handle;
    }
  }
  if (!fromHandle || !nearest) return null;

  return {
    from: { elementId: source.id, anchorId: draft.fromAnchorId, x: fromHandle.x, y: fromHandle.y, side: fromHandle.name },
    to: { elementId: target.id, anchorId: nearest.id, x: nearest.x, y: nearest.y, side: nearest.name },
  };
};

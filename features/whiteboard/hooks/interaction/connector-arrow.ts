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

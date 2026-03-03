import { useCallback, useMemo } from "react";
import {
  ArrowRoutingMode,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  getConnectionHandlePoint,
} from "@/core/routing/connectionHandles";
import { ArrowElement, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { routeArrowPoints } from "@/core/routing/orthogonal-router";
import {
  buildAnchorId,
  parseAnchorSide,
} from "@/core/anchors/generate-anchors";
import { getShapeAnchors } from "@/core/shapes/shape-runtime";

interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface UseArrowRoutingOptions {
  elements: DrawingElement[];
  getElementBounds: (element: DrawingElement) => BoundsLike | null;
}

const arePointsEqual = (a: Point[], b: Point[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) {
      return false;
    }
  }
  return true;
};

const getFallbackStart = (arrow: ArrowElement): Point => arrow.points[0];
const getFallbackEnd = (arrow: ArrowElement): Point =>
  arrow.points[Math.max(1, arrow.points.length - 1)];

export const useArrowRouting = ({
  elements,
  getElementBounds,
}: UseArrowRoutingOptions) => {
  const elementsById = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    elements.forEach((element) => map.set(element.id, element));
    return map;
  }, [elements]);

  const handlesByElementId = useMemo(() => {
    const map = new Map<
      string,
      Array<{ name: "top" | "right" | "bottom" | "left"; x: number; y: number; id: string }>
    >();
    elements.forEach((element) => {
      if ((element as DrawingElement & { isGuide?: boolean }).isGuide) {
        return;
      }
      const bounds = getElementBounds(element);
      if (!bounds) return;

      const anchors = getShapeAnchors(element, {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      });

      if (anchors.length === 0) return;

      map.set(
        element.id,
        anchors.map((anchor) => ({
          id: anchor.id,
          name: anchor.side,
          x: anchor.x,
          y: anchor.y,
        })),
      );
    });
    return map;
  }, [elements, getElementBounds]);

  const resolveConnectionPoint = useCallback(
    (
      connection?: ArrowElement["startConnection"] | ArrowElement["endConnection"],
    ): Point | null => {
      if (!connection) return null;
      const handles = handlesByElementId.get(connection.elementId);
      if (handles) {
        const connectionSide =
          connection.handle ??
          (connection.anchorId ? parseAnchorSide(connection.anchorId) ?? undefined : undefined);
        const anchorId =
          connection.anchorId ??
          (connectionSide ? buildAnchorId(connection.elementId, connectionSide) : undefined);
        const matched =
          handles.find((handle) =>
            anchorId
              ? handle.id === anchorId
              : connectionSide
                ? handle.name === connectionSide
                : false,
          ) ??
          (connectionSide
            ? handles.find((handle) => handle.name === connectionSide)
            : undefined);
        if (matched) {
          return { x: matched.x, y: matched.y };
        }
      }

      const connected = elementsById.get(connection.elementId);
      if (!connected) return null;
      const bounds = getElementBounds(connected);
      if (!bounds) return null;
      const fallbackSide =
        connection.handle ??
        (connection.anchorId ? parseAnchorSide(connection.anchorId) ?? undefined : undefined);
      if (!fallbackSide) return null;
      const point = getConnectionHandlePoint(bounds, fallbackSide);
      return { x: point.x, y: point.y };
    },
    [elementsById, getElementBounds, handlesByElementId],
  );

  const routeArrow = useCallback(
    (
      arrow: ArrowElement,
      options?: {
        preserveManualBends?: boolean;
        routingMode?: ArrowRoutingMode;
      },
    ): ArrowElement => {
      const start = resolveConnectionPoint(arrow.startConnection) ?? getFallbackStart(arrow);
      const end = resolveConnectionPoint(arrow.endConnection) ?? getFallbackEnd(arrow);

      const points = routeArrowPoints({
        start,
        end,
        startHandle:
          arrow.startConnection?.handle ??
          (arrow.startConnection?.anchorId
            ? parseAnchorSide(arrow.startConnection.anchorId) ?? undefined
            : undefined),
        endHandle:
          arrow.endConnection?.handle ??
          (arrow.endConnection?.anchorId
            ? parseAnchorSide(arrow.endConnection.anchorId) ?? undefined
            : undefined),
        routePreference: arrow.routePreference,
        routingMode: options?.routingMode ?? arrow.routingMode ?? "orthogonal",
        existingPoints: arrow.points,
        preserveManualBends:
          options?.preserveManualBends ?? Boolean(arrow.isManuallyRouted),
      });

      return { ...arrow, points };
    },
    [resolveConnectionPoint],
  );

  const rerouteArrowsForChanges = useCallback(
    (changedElements: DrawingElement[]): ArrowElement[] => {
      if (changedElements.length === 0) return [];

      const changedIds = new Set(changedElements.map((element) => element.id));
      const updates: ArrowElement[] = [];

      elements.forEach((element) => {
        if (!isArrowElement(element)) return;

        const startChanged =
          !!element.startConnection &&
          changedIds.has(element.startConnection.elementId);
        const endChanged =
          !!element.endConnection && changedIds.has(element.endConnection.elementId);
        if (!startChanged && !endChanged) return;

        const rerouted = routeArrow(element, {
          preserveManualBends: Boolean(element.isManuallyRouted),
        });
        if (!arePointsEqual(element.points, rerouted.points)) {
          updates.push(rerouted);
        }
      });

      return updates;
    },
    [elements, routeArrow],
  );

  return {
    routeArrow,
    rerouteArrowsForChanges,
    resolveConnectionPoint,
  };
};

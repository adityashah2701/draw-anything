import { useCallback, useMemo } from "react";
import {
  ArrowRoutingMode,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  getConnectionHandlePoint,
  getConnectionHandlesForBounds,
} from "@/core/routing/connectionHandles";
import { ArrowElement, isArrowElement } from "@/core/shapes/Arrow";
import { routeArrowPoints } from "@/core/routing/orthogonalRouter";

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
    const map = new Map<string, ReturnType<typeof getConnectionHandlesForBounds>>();
    elements.forEach((element) => {
      if (
        element.type !== "rectangle" &&
        element.type !== "circle" &&
        element.type !== "diamond"
      ) {
        return;
      }
      const bounds = getElementBounds(element);
      if (!bounds) return;
      map.set(element.id, getConnectionHandlesForBounds(bounds));
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
        const matched = handles.find((handle) => handle.name === connection.handle);
        if (matched) {
          return { x: matched.x, y: matched.y };
        }
      }

      const connected = elementsById.get(connection.elementId);
      if (!connected) return null;
      const bounds = getElementBounds(connected);
      if (!bounds) return null;
      const point = getConnectionHandlePoint(bounds, connection.handle);
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
        startHandle: arrow.startConnection?.handle,
        endHandle: arrow.endConnection?.handle,
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


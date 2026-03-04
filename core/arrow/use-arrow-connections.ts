import { useCallback, useMemo } from "react";
import {
  ArrowConnection,
  ConnectionHandle,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  Anchor,
  AnchorIndex,
  buildAnchorId,
  createAnchorLookupKey,
  generateAnchorsForElement,
  parseAnchorSide,
} from "@/core/anchors/generate-anchors";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/engines/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/algorithms/obstacle-avoidance";
import { ArrowElement, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";

interface UseArrowConnectionsOptions {
  elements: DrawingElement[];
  anchorIndex: AnchorIndex;
  getElementBounds: (element: DrawingElement) => {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}

const arePointsEqual = (a: Point[], b: Point[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
};

const getSideFromConnection = (
  connection: ArrowConnection | undefined,
  anchor: Anchor | null,
): ConnectionHandle | undefined => {
  if (anchor) return anchor.side;
  if (connection?.handle) return connection.handle;
  if (connection?.anchorId) {
    return parseAnchorSide(connection.anchorId) ?? undefined;
  }
  return undefined;
};

export const useArrowConnections = ({
  elements,
  anchorIndex,
  getElementBounds,
}: UseArrowConnectionsOptions) => {
  const isRoutingObstacleElement = useCallback(
    (element: DrawingElement) => {
      if ((element as DrawingElement & { isGuide?: boolean }).isGuide) {
        return false;
      }
      return (
        (anchorIndex.anchorsByElementId.get(element.id)?.length ?? 0) > 0 ||
        element.type === "text"
      );
    },
    [anchorIndex.anchorsByElementId],
  );

  const baseRoutingObstacles = useMemo(() => {
    const obstacles = new Map<string, RoutingObstacle>();
    elements.forEach((element) => {
      if (!isRoutingObstacleElement(element)) return;
      const bounds = getElementBounds(element);
      if (!bounds) return;
      obstacles.set(element.id, {
        id: element.id,
        bounds: {
          minX: bounds.minX,
          minY: bounds.minY,
          maxX: bounds.maxX,
          maxY: bounds.maxY,
        },
      });
    });
    return obstacles;
  }, [elements, getElementBounds, isRoutingObstacleElement]);

  const getRoutingObstacles = useCallback(
    (
      boundsOverrides?: Map<
        string,
        {
          minX: number;
          minY: number;
          maxX: number;
          maxY: number;
        }
      >,
    ): RoutingObstacle[] => {
      if (!boundsOverrides || boundsOverrides.size === 0) {
        return Array.from(baseRoutingObstacles.values());
      }

      const merged = new Map(baseRoutingObstacles);
      boundsOverrides.forEach((bounds, elementId) => {
        if (!merged.has(elementId)) return;
        merged.set(elementId, {
          id: elementId,
          bounds: {
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.maxY,
          },
        });
      });
      return Array.from(merged.values());
    },
    [baseRoutingObstacles],
  );

  const resolveAnchor = useCallback(
    (connection?: ArrowConnection): Anchor | null => {
      if (!connection) return null;
      if (connection.anchorId) {
        const match = anchorIndex.anchorByLookupKey.get(
          createAnchorLookupKey(connection.elementId, connection.anchorId),
        );
        if (match) return match;
      }

      if (connection.handle) {
        const fallbackId = buildAnchorId(connection.elementId, connection.handle);
        return (
          anchorIndex.anchorByLookupKey.get(
            createAnchorLookupKey(connection.elementId, fallbackId),
          ) ?? null
        );
      }

      return null;
    },
    [anchorIndex.anchorByLookupKey],
  );

  const resolveAnchorFromOverrides = useCallback(
    (
      connection: ArrowConnection | undefined,
      overrides: Map<string, Anchor[]>,
    ): Anchor | null => {
      if (!connection) return null;

      const overrideAnchors = overrides.get(connection.elementId);
      if (overrideAnchors && overrideAnchors.length > 0) {
        if (connection.anchorId) {
          const matchedById = overrideAnchors.find(
            (anchor) => anchor.id === connection.anchorId,
          );
          if (matchedById) return matchedById;
        }
        const fallbackSide =
          connection.handle ??
          (connection.anchorId ? parseAnchorSide(connection.anchorId) ?? undefined : undefined);
        if (fallbackSide) {
          const matchedBySide = overrideAnchors.find(
            (anchor) => anchor.side === fallbackSide,
          );
          if (matchedBySide) return matchedBySide;
        }
      }

      return resolveAnchor(connection);
    },
    [resolveAnchor],
  );

  const buildRouteDescriptor = useCallback(
    (
      arrow: ArrowElement,
      overrides?: Map<string, Anchor[]>,
    ): RouteArrowDescriptor => {
      const startAnchor = overrides
        ? resolveAnchorFromOverrides(arrow.startConnection, overrides)
        : resolveAnchor(arrow.startConnection);
      const endAnchor = overrides
        ? resolveAnchorFromOverrides(arrow.endConnection, overrides)
        : resolveAnchor(arrow.endConnection);

      const startPoint = startAnchor ?? arrow.points[0];
      const endPoint = endAnchor ?? arrow.points[Math.max(1, arrow.points.length - 1)];

      return {
        arrowId: arrow.id,
        start: startPoint,
        end: endPoint,
        startHandle: getSideFromConnection(arrow.startConnection, startAnchor),
        endHandle: getSideFromConnection(arrow.endConnection, endAnchor),
        routePreference: arrow.routePreference,
        routingMode: arrow.routingMode ?? "orthogonal",
        existingPoints: arrow.points,
        preserveManualBends: Boolean(arrow.isManuallyRouted),
        sourceId: arrow.startConnection?.elementId,
        targetId: arrow.endConnection?.elementId,
      };
    },
    [resolveAnchor, resolveAnchorFromOverrides],
  );

  const getExistingRoutes = useCallback(
    (excludeIds: Set<string>) =>
      elements
        .filter((element) => isArrowElement(element) && !excludeIds.has(element.id))
        .map((element) => ({
          arrowId: element.id,
          points: element.points,
        })),
    [elements],
  );

  const getAllParallelCandidates = useCallback(
    (overrides?: Map<string, Anchor[]>) =>
      elements
        .filter((element) => isArrowElement(element))
        .map((element) => buildRouteDescriptor(element, overrides)),
    [buildRouteDescriptor, elements],
  );

  const bindArrowEndpoint = useCallback(
    (
      arrow: ArrowElement,
      endpoint: "start" | "end",
      point: Point,
      snap: MagneticSnapMatch | null,
    ): ArrowElement => {
      const points = arrow.points.map((entry) => ({ ...entry }));
      const index = endpoint === "start" ? 0 : Math.max(1, points.length - 1);
      const resolvedPoint = snap
        ? { x: snap.anchor.x, y: snap.anchor.y }
        : { x: point.x, y: point.y };
      points[index] = resolvedPoint;

      const connection: ArrowConnection | undefined = snap
        ? {
            elementId: snap.elementId,
            anchorId: snap.anchor.id,
          }
        : undefined;

      return {
        ...arrow,
        points,
        ...(endpoint === "start"
          ? { startConnection: connection }
          : { endConnection: connection }),
      };
    },
    [],
  );

  const routeArrowByConnections = useCallback(
    (arrow: ArrowElement): ArrowElement => {
      const descriptor = buildRouteDescriptor(arrow);
      const points = routeArrowBatch({
        arrows: [descriptor],
        obstacles: getRoutingObstacles(),
        existingRoutes: getExistingRoutes(new Set([arrow.id])),
        allParallelCandidates: getAllParallelCandidates(),
      }).get(arrow.id);

      return {
        ...arrow,
        points: points ?? arrow.points,
      };
    },
    [
      buildRouteDescriptor,
      getAllParallelCandidates,
      getExistingRoutes,
      getRoutingObstacles,
    ],
  );

  const rerouteConnectedArrowsForChanges = useCallback(
    (changedElements: DrawingElement[]): ArrowElement[] => {
      if (changedElements.length === 0) return [];

      const changedIds = new Set(changedElements.map((element) => element.id));
      const anchorOverrides = new Map<string, Anchor[]>();
      const boundsOverrides = new Map<
        string,
        {
          minX: number;
          minY: number;
          maxX: number;
          maxY: number;
        }
      >();
      changedElements.forEach((element) => {
        const nextBounds = getElementBounds(element);
        if (nextBounds) {
          boundsOverrides.set(element.id, nextBounds);
        }
        const anchors = generateAnchorsForElement(element, nextBounds);
        if (anchors.length > 0) {
          anchorOverrides.set(element.id, anchors);
        }
      });
      const affectedArrows = elements.filter((element): element is ArrowElement => {
        if (!isArrowElement(element)) return false;
        const startChanged =
          !!element.startConnection &&
          changedIds.has(element.startConnection.elementId);
        const endChanged =
          !!element.endConnection &&
          changedIds.has(element.endConnection.elementId);

        return startChanged || endChanged;
      });

      if (affectedArrows.length === 0) return [];

      const affectedIds = new Set(affectedArrows.map((arrow) => arrow.id));
      const reroutedPointsByArrowId = routeArrowBatch({
        arrows: affectedArrows.map((arrow) =>
          buildRouteDescriptor(arrow, anchorOverrides),
        ),
        obstacles: getRoutingObstacles(boundsOverrides),
        existingRoutes: getExistingRoutes(affectedIds),
        allParallelCandidates: getAllParallelCandidates(anchorOverrides),
      });

      const updates: ArrowElement[] = [];
      affectedArrows.forEach((arrow) => {
        const points = reroutedPointsByArrowId.get(arrow.id);
        if (!points || arePointsEqual(points, arrow.points)) return;
        updates.push({ ...arrow, points });
      });

      return updates;
    },
    [
      buildRouteDescriptor,
      elements,
      getAllParallelCandidates,
      getElementBounds,
      getExistingRoutes,
      getRoutingObstacles,
    ],
  );

  return {
    resolveAnchor,
    bindArrowEndpoint,
    routeArrowByConnections,
    rerouteConnectedArrowsForChanges,
  };
};

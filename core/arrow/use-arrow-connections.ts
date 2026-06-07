import { useCallback, useMemo, useRef } from "react";
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
  routeWithEngine,
  createRouteEngineState,
  markEdgeDirty,
  clearEdgeDirty,
  AdjacencyMap,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import { recordPath } from "@/core/routing/congestion-map";
import { ArrowElement, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";
import { globalPathCache } from "@/core/routing/path-cache";
import {
  isNonEmptyString,
  isValidPoint,
  isValidPointArray,
} from "@/core/routing/routing-guards";

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
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.x !== right.x || left.y !== right.y) return false;
  }
  return true;
};

const isRouteDescriptorReady = (descriptor: RouteArrowDescriptor) =>
  isNonEmptyString(descriptor.arrowId) &&
  isNonEmptyString(descriptor.sourceId) &&
  isNonEmptyString(descriptor.targetId) &&
  isValidPoint(descriptor.start) &&
  isValidPoint(descriptor.end) &&
  (!Array.isArray(descriptor.existingPoints) ||
    isValidPointArray(descriptor.existingPoints, 2));

const serializePoints = (points?: Point[]): string => {
  if (!Array.isArray(points) || points.length === 0) return "no-path";
  return points
    .map((point) =>
      isValidPoint(point)
        ? `${Math.round(point.x * 1000) / 1000},${Math.round(point.y * 1000) / 1000}`
        : "invalid",
    )
    .join("|");
};

const serializeObstacles = (obstacles: RoutingObstacle[]): string =>
  [...obstacles]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (obstacle) =>
        `${obstacle.id}:${obstacle.bounds.minX},${obstacle.bounds.minY},${obstacle.bounds.maxX},${obstacle.bounds.maxY}`,
    )
    .join("|");

const buildRouteCacheSignature = (
  descriptor: RouteArrowDescriptor,
  obstacleSignature: string,
): string =>
  [
    obstacleSignature,
    descriptor.sourceId ?? "",
    descriptor.targetId ?? "",
    descriptor.startHandle ?? "",
    descriptor.endHandle ?? "",
    descriptor.routePreference ?? "",
    descriptor.routingMode ?? "orthogonal",
    descriptor.preserveManualBends ? "manual" : "auto",
    serializePoints(descriptor.existingPoints),
  ].join("|");

const buildRouteStateHash = (descriptor: RouteArrowDescriptor): string =>
  [
    descriptor.sourceId ?? "",
    descriptor.targetId ?? "",
    descriptor.startHandle ?? "",
    descriptor.endHandle ?? "",
    descriptor.routePreference ?? "",
    descriptor.routingMode ?? "orthogonal",
    descriptor.preserveManualBends ? "manual" : "auto",
    serializePoints(descriptor.existingPoints),
    `${Math.round(descriptor.start.x * 1000) / 1000},${Math.round(descriptor.start.y * 1000) / 1000}`,
    `${Math.round(descriptor.end.x * 1000) / 1000},${Math.round(descriptor.end.y * 1000) / 1000}`,
  ].join("|");

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

  const routeEngineStateRef = useRef(createRouteEngineState());

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

  const baseRoutingObstacleList = useMemo(
    () => Array.from(baseRoutingObstacles.values()),
    [baseRoutingObstacles],
  );
  const baseRoutingObstacleSignature = useMemo(
    () => serializeObstacles(baseRoutingObstacleList),
    [baseRoutingObstacleList],
  );

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
        return baseRoutingObstacleList;
      }

      return baseRoutingObstacleList.map((obstacle) => {
        const override = boundsOverrides.get(obstacle.id);
        if (!override) return obstacle;
        return {
          id: obstacle.id,
          bounds: {
            minX: override.minX,
            minY: override.minY,
            maxX: override.maxX,
            maxY: override.maxY,
          },
        };
      });
    },
    [baseRoutingObstacleList],
  );

  const adjacencyMap = useMemo(() => {
    const edges = elements
      .filter((element) => isArrowElement(element))
      .filter(
        (arrow) =>
          isNonEmptyString(arrow.startConnection?.elementId) &&
          isNonEmptyString(arrow.endConnection?.elementId),
      )
      .map((arrow) => ({
        arrowId: arrow.id,
        sourceId: arrow.startConnection!.elementId,
        targetId: arrow.endConnection!.elementId,
      }));
    return AdjacencyMap.fromEdges(edges);
  }, [elements]);

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
        .map((element) => buildRouteDescriptor(element, overrides))
        .filter(isRouteDescriptorReady),
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
      if (!isRouteDescriptorReady(descriptor)) {
        return arrow;
      }

      const cacheSignature = buildRouteCacheSignature(
        descriptor,
        baseRoutingObstacleSignature,
      );

      // 1. Try to read from Path Cache
      const cachedPoints = globalPathCache.get(
        arrow.id,
        descriptor.start,
        descriptor.end,
        cacheSignature,
      );
      if (cachedPoints) {
        routeEngineStateRef.current.routeCache.set(arrow.id, cachedPoints);
        routeEngineStateRef.current.pathHashCache.set(
          arrow.id,
          buildRouteStateHash(descriptor),
        );
        recordPath(routeEngineStateRef.current.congestionMap, arrow.id, cachedPoints);
        clearEdgeDirty(routeEngineStateRef.current, arrow.id);
        return {
          ...arrow,
          points: cachedPoints,
        };
      }

      // 2. Otherwise run routing engine
      markEdgeDirty(routeEngineStateRef.current, arrow.id);
      const result = routeWithEngine(
        [descriptor],
        {
          obstacles: getRoutingObstacles(),
          existingRoutes: getExistingRoutes(new Set([arrow.id])),
          allParallelCandidates: getAllParallelCandidates(),
        },
        routeEngineStateRef.current,
      );
      const points = result.routes.get(arrow.id);

      // 3. Cache the newly computed route
      if (points) {
        globalPathCache.set(
          arrow.id,
          descriptor.start,
          descriptor.end,
          points,
          cacheSignature,
        );
        routeEngineStateRef.current.routeCache.set(arrow.id, points);
        routeEngineStateRef.current.pathHashCache.set(
          arrow.id,
          buildRouteStateHash(descriptor),
        );
        recordPath(routeEngineStateRef.current.congestionMap, arrow.id, points);
      }

      return {
        ...arrow,
        points: points ?? arrow.points,
      };
    },
    [
      buildRouteDescriptor,
      baseRoutingObstacleSignature,
      getAllParallelCandidates,
      getExistingRoutes,
      getRoutingObstacles,
    ],
  );

  const rerouteConnectedArrowsForChanges = useCallback(
    (changedElements: DrawingElement[]): ArrowElement[] => {
      if (changedElements.length === 0) return [];

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

      const affectedArrowIds = new Set<string>();
      changedElements.forEach((element) => {
        adjacencyMap.getEdgesForNode(element.id).forEach((edgeId) => {
          affectedArrowIds.add(edgeId);
        });
        if (isArrowElement(element)) {
          affectedArrowIds.add(element.id);
        }
      });

      const affectedArrows = elements.filter(
        (element): element is ArrowElement =>
          isArrowElement(element) && affectedArrowIds.has(element.id),
      );

      if (affectedArrows.length === 0) return [];

      const affectedIds = new Set(affectedArrows.map((arrow) => arrow.id));
      const descriptors = affectedArrows
        .map((arrow) => buildRouteDescriptor(arrow, anchorOverrides))
        .filter(isRouteDescriptorReady);
      if (descriptors.length === 0) return [];

      const routingObstacles = getRoutingObstacles(boundsOverrides);
      const routingObstacleSignature = serializeObstacles(routingObstacles);

      // Check path cache for each descriptor first
      const descriptorsToRoute: RouteArrowDescriptor[] = [];
      const cachedRoutes = new Map<string, Point[]>();

      descriptors.forEach((descriptor) => {
        const cacheSignature = buildRouteCacheSignature(
          descriptor,
          routingObstacleSignature,
        );
        const cached = globalPathCache.get(
          descriptor.arrowId,
          descriptor.start,
          descriptor.end,
          cacheSignature,
        );
        if (cached) {
          cachedRoutes.set(descriptor.arrowId, cached);
          routeEngineStateRef.current.routeCache.set(descriptor.arrowId, cached);
          routeEngineStateRef.current.pathHashCache.set(
            descriptor.arrowId,
            buildRouteStateHash(descriptor),
          );
          recordPath(
            routeEngineStateRef.current.congestionMap,
            descriptor.arrowId,
            cached,
          );
          clearEdgeDirty(routeEngineStateRef.current, descriptor.arrowId);
        } else {
          descriptorsToRoute.push(descriptor);
        }
      });

      let rerouted = { routes: new Map<string, Point[]>() };
      if (descriptorsToRoute.length > 0) {
        descriptorsToRoute.forEach((d) => {
          markEdgeDirty(routeEngineStateRef.current, d.arrowId);
        });
        rerouted = routeWithEngine(
          descriptorsToRoute,
          {
            obstacles: routingObstacles,
            existingRoutes: getExistingRoutes(affectedIds),
            allParallelCandidates: getAllParallelCandidates(anchorOverrides),
          },
          routeEngineStateRef.current,
        );

        // Cache newly routed paths
        descriptorsToRoute.forEach((descriptor) => {
          const points = rerouted.routes.get(descriptor.arrowId);
          if (points) {
            globalPathCache.set(
              descriptor.arrowId,
              descriptor.start,
              descriptor.end,
              points,
              buildRouteCacheSignature(descriptor, routingObstacleSignature),
            );
            routeEngineStateRef.current.routeCache.set(descriptor.arrowId, points);
            routeEngineStateRef.current.pathHashCache.set(
              descriptor.arrowId,
              buildRouteStateHash(descriptor),
            );
            recordPath(routeEngineStateRef.current.congestionMap, descriptor.arrowId, points);
          }
        });
      }

      const updates: ArrowElement[] = [];
      affectedArrows.forEach((arrow) => {
        const points = cachedRoutes.get(arrow.id) ?? rerouted.routes.get(arrow.id);
        if (!points || arePointsEqual(points, arrow.points)) return;
        updates.push({ ...arrow, points });
      });

      return updates;
    },
    [
      buildRouteDescriptor,
      baseRoutingObstacleSignature,
      adjacencyMap,
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

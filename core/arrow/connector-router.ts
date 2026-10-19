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
import type { RouteArrowDescriptor } from "@/core/routing/orthogonal-router";
import {
  routeWithEngine,
  createRouteEngineState,
  markEdgeDirty,
  clearEdgeDirty,
  pruneRouteEngineState,
} from "@/core/routing/route-engine";
import { AdjacencyMap } from "@/core/routing/adjacency-map";
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

export interface ConnectorRouterOptions {
  elements: DrawingElement[];
  /** Route caches and the congestion map. Keep one per document so repeated routing reuses its work. */
  state: RouteEngineState;
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

export type RouteEngineState = ReturnType<typeof createRouteEngineState>;

/** Routes descriptors, serving each from `globalPathCache` when possible and caching what the engine computes. */
const routeThroughCaches = (
  state: RouteEngineState,
  descriptors: RouteArrowDescriptor[],
  obstacles: RoutingObstacle[],
  obstacleSignature: string,
  engineInputs: () => {
    existingRoutes: { arrowId: string; points: Point[] }[];
    allParallelCandidates: RouteArrowDescriptor[];
  },
): Map<string, Point[]> => {
  const routes = new Map<string, Point[]>();
  const toRoute: RouteArrowDescriptor[] = [];

  for (const descriptor of descriptors) {
    const signature = buildRouteCacheSignature(descriptor, obstacleSignature);
    const cached = globalPathCache.get(
      descriptor.arrowId,
      descriptor.start,
      descriptor.end,
      signature,
    );
    if (cached) {
      routes.set(descriptor.arrowId, cached);
      state.routeCache.set(descriptor.arrowId, cached);
      // Primed from globalPathCache, not computed by the engine: leave no hash
      // behind so the engine never treats this entry as validated.
      state.pathHashCache.delete(descriptor.arrowId);
      recordPath(state.congestionMap, descriptor.arrowId, cached);
      clearEdgeDirty(state, descriptor.arrowId);
    } else {
      toRoute.push(descriptor);
    }
  }
  if (toRoute.length === 0) return routes;

  toRoute.forEach((descriptor) => markEdgeDirty(state, descriptor.arrowId));
  const result = routeWithEngine(toRoute, { obstacles, ...engineInputs() }, state);
  for (const descriptor of toRoute) {
    const points = result.routes.get(descriptor.arrowId);
    if (!points) continue;
    routes.set(descriptor.arrowId, points);
    globalPathCache.set(
      descriptor.arrowId,
      descriptor.start,
      descriptor.end,
      points,
      buildRouteCacheSignature(descriptor, obstacleSignature),
    );
    state.routeCache.set(descriptor.arrowId, points);
    recordPath(state.congestionMap, descriptor.arrowId, points);
  }
  return routes;
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

/**
 * The connector router as plain code: no React, no storage. The editor's `useArrowConnections` wraps it
 * in a memo, and the AI tools build one over the board they are editing, so a connector made by a human
 * and one made by the agent are routed by exactly the same engine (anchors, obstacles, parallel edges,
 * caches).
 */
export const createConnectorRouter = ({ elements, state, anchorIndex, getElementBounds }: ConnectorRouterOptions) => {
  const isRoutingObstacleElement = (element: DrawingElement) => {
    if ((element as DrawingElement & { isGuide?: boolean }).isGuide) {
      return false;
    }
    return (
      (anchorIndex.anchorsByElementId.get(element.id)?.length ?? 0) > 0 ||
      element.type === "text"
    );
  };

  // The engine is routinely handed a subset of arrows (only those touched by a
  // drag), so it cannot see deletions. Tell it which arrows still exist so
  // deleted arrows stop occupying the route cache and the congestion map.
  const liveArrowIds = new Set<string>();
  for (const element of elements) {
    if (isArrowElement(element)) liveArrowIds.add(element.id);
  }
  pruneRouteEngineState(state, liveArrowIds);

  const baseRoutingObstacles = (() => {
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
  })();

  const baseRoutingObstacleList = Array.from(baseRoutingObstacles.values());
  const baseRoutingObstacleSignature = serializeObstacles(baseRoutingObstacleList);

  const getRoutingObstacles = (
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
  };

  const adjacencyMap = (() => {
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
  })();

  const resolveAnchor = (connection?: ArrowConnection): Anchor | null => {
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
  };

  const resolveAnchorFromOverrides = (
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
  };

  const buildRouteDescriptor = (
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
  };

  const getExistingRoutes = (excludeIds: Set<string>) =>
    elements
      .filter((element) => isArrowElement(element) && !excludeIds.has(element.id))
      .map((element) => ({
        arrowId: element.id,
        points: element.points,
      }));

  const getAllParallelCandidates = (overrides?: Map<string, Anchor[]>) =>
    elements
      .filter((element) => isArrowElement(element))
      .map((element) => buildRouteDescriptor(element, overrides))
      .filter(isRouteDescriptorReady);

  const bindArrowEndpoint = (
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
  };

  const routeArrowByConnections = (arrow: ArrowElement): ArrowElement => {
    const descriptor = buildRouteDescriptor(arrow);
    if (!isRouteDescriptorReady(descriptor)) {
      return arrow;
    }

    const routes = routeThroughCaches(
      state,
      [descriptor],
      getRoutingObstacles(),
      baseRoutingObstacleSignature,
      () => ({
        existingRoutes: getExistingRoutes(new Set([arrow.id])),
        allParallelCandidates: getAllParallelCandidates(),
      }),
    );
    return { ...arrow, points: routes.get(arrow.id) ?? arrow.points };
  };

  const rerouteConnectedArrowsForChanges = (changedElements: DrawingElement[]): ArrowElement[] => {
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

    const routes = routeThroughCaches(
      state,
      descriptors,
      routingObstacles,
      routingObstacleSignature,
      () => ({
        existingRoutes: getExistingRoutes(affectedIds),
        allParallelCandidates: getAllParallelCandidates(anchorOverrides),
      }),
    );

    const updates: ArrowElement[] = [];
    affectedArrows.forEach((arrow) => {
      const points = routes.get(arrow.id);
      if (!points || arePointsEqual(points, arrow.points)) return;
      updates.push({ ...arrow, points });
    });

    return updates;
  };

  return {
    resolveAnchor,
    bindArrowEndpoint,
    routeArrowByConnections,
    rerouteConnectedArrowsForChanges,
  };
};

export type ConnectorRouter = ReturnType<typeof createConnectorRouter>;

import {
  getFallbackOrthogonalPath,
  pinPathEndpointStubs,
  reanchorPathEndpoints,
  stabilizeArrowRouteEndpoints,
} from "@/core/routing/endpoint-stubs";
export { stabilizeArrowRouteEndpoints } from "@/core/routing/endpoint-stubs";
export { moveOrthogonalSegment } from "@/core/routing/path-editing";
import {
  ArrowRoutePreference,
  ArrowRoutingMode,
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { Aabb } from "@/core/collision/aabb";
import {
  computeParallelOffsets,
  ParallelEdgeDescriptor,
} from "@/core/routing/parallel-edge-manager";
import {
  ObstacleAwareRouteInput,
  PathRankingConfig,
  RoutingObstacle,
} from "@/core/routing/obstacle-avoidance";
import {
  compressOrthogonalPath,
  isOrthogonalPath,
  isOrthogonalSegment,
  orthogonalizePath,
  EPSILON,
} from "@/core/routing/routing-utils";
import {
  addPathToSegmentSpatialIndex,
  buildSegmentSpatialIndex,
  countPathCrossingsWithSpatialIndex,
  resolvePathSegmentConflicts,
  SegmentConflictOptions,
  SegmentSpatialIndex,
} from "@/core/routing/segment-conflict-resolver";
import {
  computeLaneAssignments,
  applyLaneOffsets,
} from "@/core/routing/lane-manager";
import {
  normalizeRoutes,
  PathNormalizerOptions,
} from "@/core/routing/path-normalizer";
import { getObstacleAwareOrthogonalPath, meetsAnchorsCleanly } from "@/core/routing/obstacle-avoidance";
import {
  isNonEmptyString,
  isValidPoint,
  isValidPointArray,
  sanitizeObstacles,
} from "@/core/routing/routing-guards";

const getDominantAxis = (
  start: Point,
  end: Point,
): "horizontal" | "vertical" =>
  Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) - EPSILON
    ? "horizontal"
    : "vertical";

const applyParallelOffset = (
  points: Point[],
  start: Point,
  end: Point,
  offset: number,
  lockEndpointStubs: boolean,
  preference: "hv" | "vh" = "hv",
): Point[] => {
  if (Math.abs(offset) < EPSILON || points.length <= 2) return points;

  const dominantAxis = getDominantAxis(start, end);
  const shifted = points.map((point) => ({ ...point }));
  const fromIndex = lockEndpointStubs ? 2 : 1;
  const toIndexExclusive = lockEndpointStubs
    ? Math.max(shifted.length - 2, fromIndex)
    : shifted.length - 1;

  for (let i = fromIndex; i < toIndexExclusive; i += 1) {
    if (dominantAxis === "horizontal") {
      shifted[i] = { ...shifted[i], y: shifted[i].y + offset };
    } else {
      shifted[i] = { ...shifted[i], x: shifted[i].x + offset };
    }
  }

  // Re-orthogonalize after shifting points to fix any diagonals at the shift boundaries.
  return orthogonalizePath(shifted, preference);
};

export interface RouteArrowInput
  extends Pick<
    ObstacleAwareRouteInput,
    | "start"
    | "end"
    | "startHandle"
    | "endHandle"
    | "routePreference"
    | "obstacles"
    | "ignoreObstacleIds"
    | "obstaclePadding"
    | "candidatePenalty"
  > {
  arrowId?: string;
  sourceId?: string;
  targetId?: string;
  routingMode?: ArrowRoutingMode;
  existingPoints?: Point[];
  preserveManualBends?: boolean;
  parallelOffset?: number;
  occupiedSegments?: SegmentSpatialIndex | null;
  conflictOptions?: SegmentConflictOptions;
  pathRanking?: PathRankingWeights;
}

export interface RouteArrowDescriptor {
  arrowId: string;
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
  routePreference?: ArrowRoutePreference;
  routingMode?: ArrowRoutingMode;
  existingPoints?: Point[];
  preserveManualBends?: boolean;
  sourceId?: string;
  targetId?: string;
}

export interface RouteArrowBatchInput {
  arrows: RouteArrowDescriptor[];
  obstacles?: RoutingObstacle[];
  existingRoutes?: Array<{ arrowId: string; points: Point[] }>;
  allParallelCandidates?: ParallelEdgeDescriptor[];
  obstaclePadding?: number;
  parallelSpacing?: number;
  conflictOptions?: SegmentConflictOptions;
  pathRanking?: PathRankingWeights;
  /** Optional layer boundary Y-coordinates for layer-aware routing. */
  layerBoundaryYs?: number[];
  /** Optional cluster bounding boxes for cluster-aware routing. */
  clusterBounds?: Aabb[];
}

export interface PathRankingWeights extends PathRankingConfig {
  crossingPenalty?: number;
}

export const routeArrowPoints = ({
  arrowId = "arrow",
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
  routingMode = "orthogonal",
  existingPoints,
  preserveManualBends = false,
  obstacles = [],
  ignoreObstacleIds,
  obstaclePadding = 12,
  parallelOffset = 0,
  occupiedSegments = null,
  conflictOptions,
  pathRanking,
}: RouteArrowInput): Point[] => {
  const safeObstacles = sanitizeObstacles(obstacles);

  // ── Defensive guard: never crash on undefined/invalid points ──
  if (!isValidPoint(start) || !isValidPoint(end)) {
    // Return straight fallback; if both are missing, return empty array
    if (isValidPoint(start) && !isValidPoint(end)) return [start];
    if (!isValidPoint(start) && isValidPoint(end)) return [end];
    return [];
  }

  try {
    return routeArrowPointsInternal({
      arrowId,
      start,
      end,
      startHandle,
      endHandle,
      routePreference,
      routingMode,
      existingPoints,
      preserveManualBends,
      obstacles: safeObstacles,
      ignoreObstacleIds,
      obstaclePadding,
      parallelOffset,
      occupiedSegments,
      conflictOptions,
      pathRanking,
    });
  } catch (err) {
    // Fail-safe: never crash the app on routing errors
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[routeArrowPoints] Routing failed, using straight fallback:",
        err,
      );
    }
    return getFallbackOrthogonalPath(start, end, routePreference);
  }
};

const routeArrowPointsInternal = ({
  arrowId = "arrow",
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
  sourceId,
  targetId,
  routingMode = "orthogonal",
  existingPoints,
  preserveManualBends = false,
  obstacles = [],
  ignoreObstacleIds,
  obstaclePadding = 12,
  parallelOffset = 0,
  occupiedSegments = null,
  conflictOptions,
  pathRanking,
}: RouteArrowInput): Point[] => {
  const endpointPreference =
    routePreference ??
    (startHandle
      ? startHandle === "top" || startHandle === "bottom"
        ? "hv"
        : "vh"
      : endHandle
        ? endHandle === "top" || endHandle === "bottom"
          ? "vh"
          : "hv"
        : "hv");

  if (routingMode === "straight") {
    return [start, end];
  }

  if (preserveManualBends && isValidPointArray(existingPoints, 3)) {
    const kept = stabilizeArrowRouteEndpoints(
      reanchorPathEndpoints(existingPoints, start, end),
      start,
      end,
      startHandle,
      endHandle,
      endpointPreference,
    );
    // The user's bends are kept while they still fit the anchors. Once a shape has moved so that the path would
    // run along or into a shape's side, they no longer do, and the arrow is routed afresh instead.
    if (isOrthogonalPath(kept) && meetsAnchorsCleanly(kept, startHandle, endHandle)) return kept;
  }

  const ignoreIds = new Set<string>(ignoreObstacleIds ?? []);
  const lockEndpointStubs = Boolean(startHandle || endHandle);
  const crossingPenalty = pathRanking?.crossingPenalty ?? 0;
  const candidatePenalty =
    occupiedSegments && crossingPenalty > 0
      ? (candidate: Point[]) =>
          countPathCrossingsWithSpatialIndex(
            arrowId,
            candidate,
            occupiedSegments,
          ) * crossingPenalty
      : undefined;

  let points = getObstacleAwareOrthogonalPath({
    start,
    end,
    startHandle,
    endHandle,
    routePreference,
    obstacles,
    ignoreObstacleIds: Array.from(ignoreIds),
    obstaclePadding,
    candidatePenalty,
    pathRanking,
  });
  points = orthogonalizePath(
    points,
    endpointPreference,
  );

  points = applyParallelOffset(
    points,
    start,
    end,
    parallelOffset,
    lockEndpointStubs,
    endpointPreference,
  );
  points = pinPathEndpointStubs(
    points,
    start,
    end,
    startHandle,
    endHandle,
    undefined,
    endpointPreference,
  );
  points = resolvePathSegmentConflicts({
    arrowId,
    path: points,
    occupiedSegments,
    obstacles,
    ignoreObstacleIds: Array.from(ignoreIds),
    obstaclePadding,
    options: conflictOptions,
  });
  // Final orthogonalization and pinning sequence
  points = orthogonalizePath(
    points,
    endpointPreference,
  );
  points = pinPathEndpointStubs(
    points,
    start,
    end,
    startHandle,
    endHandle,
    undefined,
    endpointPreference,
  );

  const finalPoints = compressOrthogonalPath(points);

  // ── Single-edge Normalization ──
  // Ensure even single-arrow routes benefit from Manhattan enforcement and grid snapping.
  const routes = new Map<string, Point[]>([[arrowId, finalPoints]]);
  const ignoreIdsSet = new Set<string>();
  if (sourceId) ignoreIdsSet.add(sourceId);
  if (targetId) ignoreIdsSet.add(targetId);

  const normalized = normalizeRoutes(routes, {
    gridSize: 16,
    snapToGrid: true,
    corridorTolerance: 2,
    minStubLength: 24,
    obstacles,
    ignoreObstacleIdsByArrow: new Map([[arrowId, ignoreIdsSet]]),
    obstaclePadding,
  });
  return stabilizeArrowRouteEndpoints(
    normalized.get(arrowId) || finalPoints,
    start,
    end,
    startHandle,
    endHandle,
    endpointPreference,
  );
};

export const routeArrowBatch = ({
  arrows,
  obstacles = [],
  existingRoutes = [],
  allParallelCandidates,
  obstaclePadding = 12,
  parallelSpacing = 16,
  conflictOptions,
  pathRanking,
  layerBoundaryYs,
  clusterBounds,
}: RouteArrowBatchInput): Map<string, Point[]> => {
  if (arrows.length === 0) return new Map<string, Point[]>();
  const safeObstacles = sanitizeObstacles(obstacles);

  const routableArrows = arrows.filter((arrow) => {
    if (!arrow.sourceId || !arrow.targetId || !arrow.start || !arrow.end) return false;
    if (arrow.existingPoints && arrow.existingPoints.length < 2) return false;

    return (
      isNonEmptyString(arrow.arrowId) &&
      isNonEmptyString(arrow.sourceId) &&
      isNonEmptyString(arrow.targetId) &&
      isValidPoint(arrow.start) &&
      isValidPoint(arrow.end) &&
      (!Array.isArray(arrow.existingPoints) ||
        isValidPointArray(arrow.existingPoints, 2))
    );
  });

  if (routableArrows.length === 0) {
    return new Map<string, Point[]>();
  }

  const parallelInputs: ParallelEdgeDescriptor[] =
    (allParallelCandidates ??
      routableArrows.map((arrow) => ({
        arrowId: arrow.arrowId,
        sourceId: arrow.sourceId,
        targetId: arrow.targetId,
        start: arrow.start,
        end: arrow.end,
        startHandle: arrow.startHandle,
        endHandle: arrow.endHandle,
      }))).filter(
    (edge) =>
      isNonEmptyString(edge.arrowId) &&
      isNonEmptyString(edge.sourceId) &&
      isNonEmptyString(edge.targetId) &&
      isValidPoint(edge.start) &&
      isValidPoint(edge.end),
    );

  const offsets = computeParallelOffsets(parallelInputs, parallelSpacing);
  const occupied = buildSegmentSpatialIndex(existingRoutes);
  const routed = new Map<string, Point[]>();

  // Build layer/cluster-aware candidate penalty if boundaries are provided.
  const hasLayerAwareness = layerBoundaryYs && layerBoundaryYs.length > 0;
  const hasClusterAwareness = clusterBounds && clusterBounds.length > 0;

  const stableOrder = [...routableArrows].sort((a, b) =>
    a.arrowId.localeCompare(b.arrowId),
  );
  stableOrder.forEach((arrow) => {
    // Build per-arrow candidate penalty incorporating layer/cluster awareness.
    const candidatePenalty =
      hasLayerAwareness || hasClusterAwareness
        ? (points: Point[]): number => {
            let penalty = 0;
            if (hasLayerAwareness) {
              const startY = arrow.start.y;
              const endY = arrow.end.y;
              const minY = Math.min(startY, endY);
              const maxY = Math.max(startY, endY);
              for (let i = 0; i < points.length - 1; i += 1) {
                const segMinY = Math.min(points[i].y, points[i + 1].y);
                const segMaxY = Math.max(points[i].y, points[i + 1].y);
                for (const boundaryY of layerBoundaryYs!) {
                  if (boundaryY >= minY && boundaryY <= maxY) continue;
                  if (segMinY < boundaryY && segMaxY > boundaryY) {
                    penalty += 800;
                  }
                }
              }
            }
            return penalty;
          }
        : undefined;

    const points = routeArrowPoints({
      arrowId: arrow.arrowId,
      start: arrow.start,
      end: arrow.end,
      startHandle: arrow.startHandle,
      endHandle: arrow.endHandle,
      routePreference: arrow.routePreference,
      sourceId: arrow.sourceId,
      targetId: arrow.targetId,
      routingMode: arrow.routingMode ?? "orthogonal",
      existingPoints: arrow.existingPoints,
      preserveManualBends: Boolean(arrow.preserveManualBends),
      obstacles: safeObstacles,
      obstaclePadding,
      parallelOffset: offsets.get(arrow.arrowId) ?? 0,
      occupiedSegments: occupied,
      conflictOptions,
      pathRanking,
      candidatePenalty,
    });
    routed.set(arrow.arrowId, points);
    addPathToSegmentSpatialIndex(occupied, arrow.arrowId, points);
  });

  // "Straight" arrows are user-chosen diagonals; the lane and normalization
  // passes force Manhattan geometry, so they are set aside and re-attached.
  const straightRoutes = new Map<string, Point[]>();
  for (const arrow of routableArrows) {
    if (arrow.routingMode !== "straight") continue;
    const points = routed.get(arrow.arrowId);
    if (!points) continue;
    straightRoutes.set(arrow.arrowId, points);
    routed.delete(arrow.arrowId);
  }

  // Post-routing: apply lane assignments to separate collinear segments.
  const routeEntries = Array.from(routed.entries()).map(
    ([arrowId, points]) => ({
      arrowId,
      points,
    }),
  );
  const laneAssignments = computeLaneAssignments(routeEntries, {
    laneSpacing: parallelSpacing,
    maxLanes: 4,
  });
  if (laneAssignments.length > 0) {
    const laneAdjusted = applyLaneOffsets(routed, laneAssignments);
    laneAdjusted.forEach((points, arrowId) => {
      routed.set(arrowId, points);
    });
  }

  // ── Final stage: Path Normalization ──
  // Runs after all routing stages to enforce pixel-perfect Manhattan alignment,
  // grid snapping, shared corridor unification, and stub straightening.
  if (arrows.length > 0) {
    const ignoreObstacleIdsByArrow = new Map<string, Set<string>>();
    for (const arrow of arrows) {
      const ids = new Set<string>();
      if (arrow.sourceId) ids.add(arrow.sourceId);
      if (arrow.targetId) ids.add(arrow.targetId);
      if (ids.size > 0) ignoreObstacleIdsByArrow.set(arrow.arrowId, ids);
    }
    const normalizerOptions: PathNormalizerOptions = {
      gridSize: 16,
      snapToGrid: true,
      corridorTolerance: 2,
      minStubLength: 24,
      obstacles: safeObstacles,
      ignoreObstacleIdsByArrow,
      obstaclePadding,
    };
    const normalized = normalizeRoutes(routed, normalizerOptions);
    normalized.forEach((points, arrowId) => routed.set(arrowId, points));
  }

  straightRoutes.forEach((points, arrowId) => routed.set(arrowId, points));
  return routed;
};

export const compressPath = compressOrthogonalPath;

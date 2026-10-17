/**
 * Route Engine – Unified routing pipeline orchestrator.
 *
 * Coordinates the full routing pipeline:
 * 1. Port resolution → optimal connection handles
 * 2. Cluster waypoint generation
 * 3. Candidate path generation (via obstacle-avoidance)
 * 4. Path scoring with congestion + crossing + all penalties
 * 5. Segment conflict resolution
 * 6. Lane assignment with grid snapping
 * 7. Crossing minimization (lightweight post-pass)
 * 8. Final validation (hard overlap guarantee)
 *
 * Features:
 * - Dirty tracking: only recalculates affected edges
 * - Route caching: stores last valid route per arrow
 * - Deterministic: same inputs → same outputs across renders
 * - Bounding box caching for obstacles
 */

import {
  ArrowRoutePreference,
  ArrowRoutingMode,
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { Aabb } from "@/core/collision/aabb";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import {
  routeArrowPoints,
  stabilizeArrowRouteEndpoints,
} from "@/core/routing/orthogonal-router";
import {
  computeParallelOffsets,
  ParallelEdgeDescriptor,
} from "@/core/routing/parallel-edge-manager";
import {
  buildSegmentSpatialIndex,
  addPathToSegmentSpatialIndex,
  countPathCrossingsWithSpatialIndex,
  SegmentConflictOptions,
} from "@/core/routing/segment-conflict-resolver";
import {
  computeLaneAssignments,
  applyLaneOffsets,
  LaneManagerOptions,
} from "@/core/routing/lane-manager";
import {
  createCongestionMap,
  recordPath,
  removePath,
  computePathCongestionPenalty,
  CongestionMap,
  CongestionConfig,
} from "@/core/routing/congestion-map";
import {
  minimizeCrossings,
  CrossingMinimizerOptions,
} from "@/core/routing/crossing-minimizer";
import { validateNoShapeOverlap } from "@/core/routing/obstacle-detector";
import { PathRankingConfig } from "@/core/routing/obstacle-avoidance";
import { normalizeRoutes } from "@/core/routing/path-normalizer";
import {
  sanitizeEdges,
  sanitizeObstacles,
  sanitizeRoutes,
  isFullyConnectedEdge,
  isValidPoint,
} from "@/core/routing/routing-guards";

// ─────────────────── Types ───────────────────

import type { RouteEngineEdge } from "@/core/routing/types";
export type { RouteEngineEdge };

export interface RouteEngineConfig {
  /** All obstacles on the canvas. */
  obstacles: RoutingObstacle[];
  /** Padding around obstacles. Default: 12. */
  obstaclePadding?: number;
  /** Spacing between parallel edges. Default: 16. */
  parallelSpacing?: number;
  /** Segment conflict resolution options. */
  conflictOptions?: SegmentConflictOptions;
  /** Path ranking weights for candidate scoring. */
  pathRanking?: PathRankingConfig & { crossingPenalty?: number };
  /** Layer boundary Y-coordinates for layer-aware routing. */
  layerBoundaryYs?: number[];
  /** Cluster bounding boxes. */
  clusterBounds?: Aabb[];
  /** Lane manager options. */
  laneOptions?: LaneManagerOptions;
  /** Congestion map configuration. */
  congestionConfig?: CongestionConfig;
  /** Crossing minimizer options. */
  crossingOptions?: CrossingMinimizerOptions;
  /** Enable crossing minimization post-pass. Default: true. */
  enableCrossingMinimization?: boolean;
  /** Enable congestion-aware routing. Default: true. */
  enableCongestionAwareness?: boolean;
  /** Pre-existing routes from previous routed arrows. */
  existingRoutes?: Array<{ arrowId: string; points: Point[] }>;
  /** Pre-computed parallel edge descriptors. */
  allParallelCandidates?: ParallelEdgeDescriptor[];
}

export interface RouteEngineResult {
  /** Routed paths indexed by arrow ID. */
  routes: Map<string, Point[]>;
  /** Number of crossings after routing. */
  crossingCount: number;
  /** Number of validation violations (should be 0). */
  validationViolations: number;
  /** Which arrows were actually re-routed (vs cached). */
  routedArrowIds: string[];
}

// ─────────────────── Route Engine State ───────────────────

export interface RouteEngineState {
  /** Cached routes from last routing pass. */
  routeCache: Map<string, Point[]>;
  /** Set of arrow IDs that need re-routing. */
  dirtyEdges: Set<string>;
  /** Congestion map tracking segment traffic. */
  congestionMap: CongestionMap;
  /**
   * Path geometry hash cache.
   * Maps arrowId → hash of everything that determines its route: endpoints,
   * handles, mode, preference, existing points and the obstacle layout.
   * An edge whose hash is unchanged (and not marked dirty) reuses its cached
   * route; any mismatch re-routes it, so callers cannot get a stale route by
   * forgetting to call markEdgeDirty.
   */
  pathHashCache: Map<string, string>;
}

/**
 * Create a fresh route engine state for incremental routing.
 */
export const createRouteEngineState = (
  congestionConfig?: CongestionConfig,
): RouteEngineState => ({
  routeCache: new Map(),
  dirtyEdges: new Set(),
  congestionMap: createCongestionMap(congestionConfig),
  pathHashCache: new Map(),
});

/**
 * Mark an edge as dirty (needs re-routing).
 * Called when a node is moved, added, or removed.
 */
export const markEdgeDirty = (
  state: RouteEngineState,
  arrowId: string,
): void => {
  state.dirtyEdges.add(arrowId);
};

/**
 * Remove an edge from the dirty set after a cached route is reused.
 */
export const clearEdgeDirty = (
  state: RouteEngineState,
  arrowId: string,
): void => {
  state.dirtyEdges.delete(arrowId);
};

/**
 * Mark all edges connected to a shape as dirty.
 */
export const markShapeEdgesDirty = (
  state: RouteEngineState,
  shapeId: string,
  edges: RouteEngineEdge[],
): void => {
  for (const edge of edges) {
    if (edge.sourceId === shapeId || edge.targetId === shapeId) {
      state.dirtyEdges.add(edge.arrowId);
    }
  }
};

/**
 * Invalidate all cached routes.
 */
export const invalidateAllRoutes = (state: RouteEngineState): void => {
  state.dirtyEdges = new Set(state.routeCache.keys());
};

/**
 * Forget every arrow that is no longer part of the document.
 *
 * `routeWithEngine` is routinely called with a *subset* of the arrows (the
 * canvas reroutes only the arrows touched by a drag), so it cannot infer
 * deletions from its input. The owner of the state calls this with the full
 * set of live arrow ids instead; routes, hashes, dirty flags and congestion
 * contributions of everything else are dropped.
 */
export const pruneRouteEngineState = (
  state: RouteEngineState,
  liveArrowIds: ReadonlySet<string>,
): void => {
  const known = new Set<string>([
    ...state.routeCache.keys(),
    ...state.pathHashCache.keys(),
    ...state.dirtyEdges,
    ...state.congestionMap.arrowCells.keys(),
  ]);
  for (const arrowId of known) {
    if (liveArrowIds.has(arrowId)) continue;
    state.routeCache.delete(arrowId);
    state.pathHashCache.delete(arrowId);
    state.dirtyEdges.delete(arrowId);
    removePath(state.congestionMap, arrowId);
  }
};

// ─────────────────── Obstacle Hash ───────────────────

const computeObstacleHash = (obstacles: RoutingObstacle[]): string => {
  if (obstacles.length === 0) return "empty";
  return [...obstacles]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (obstacle) =>
        `${obstacle.id}:${obstacle.bounds.minX},${obstacle.bounds.minY},${obstacle.bounds.maxX},${obstacle.bounds.maxY}`,
    )
    .join("|");
};

const hashPoints = (points?: Point[]): string => {
  if (!Array.isArray(points) || points.length === 0) return "no-path";
  return points
    .map((point) =>
      isValidPoint(point)
        ? `${Math.round(point.x * 1000) / 1000},${Math.round(point.y * 1000) / 1000}`
        : "invalid",
    )
    .join("|");
};

const roundCoord = (value: number): number => Math.round(value * 1000) / 1000;

/** Everything about an edge (besides the obstacle layout) that determines its route. */
const computePathHash = (edge: RouteEngineEdge): string =>
  [
    edge.sourceId ?? "",
    edge.targetId ?? "",
    edge.startHandle ?? "",
    edge.endHandle ?? "",
    edge.routePreference ?? "",
    edge.routingMode ?? "orthogonal",
    edge.preserveManualBends ? "manual" : "auto",
    hashPoints(edge.existingPoints),
    `${roundCoord(edge.start.x)},${roundCoord(edge.start.y)}`,
    `${roundCoord(edge.end.x)},${roundCoord(edge.end.y)}`,
  ].join("|");

// ─────────────────── Main Routing Pipeline ───────────────────

/**
 * Route all edges through the full pipeline.
 *
 * Pipeline stages:
 * 1. Parallel offset computation
 * 2. Per-edge routing with obstacle avoidance + scoring
 * 3. Segment conflict resolution
 * 4. Lane assignment with grid snapping
 * 5. Crossing minimization
 * 6. Final validation
 *
 * Supports incremental routing via dirty tracking.
 */
export const routeWithEngine = (
  edges: RouteEngineEdge[],
  config: RouteEngineConfig,
  state?: RouteEngineState,
): RouteEngineResult => {
  if (edges.length === 0) {
    return {
      routes: new Map(),
      crossingCount: 0,
      validationViolations: 0,
      routedArrowIds: [],
    };
  }

  const {
    obstaclePadding = 12,
    parallelSpacing = 16,
    conflictOptions,
    pathRanking,
    laneOptions,
    congestionConfig,
    crossingOptions,
    enableCrossingMinimization = true,
    enableCongestionAwareness = true,
    allParallelCandidates,
  } = config;

  // ── Stage 0a: Sanitize inputs (Task 5 — Engine Stability) ──
  const safeEdges = sanitizeEdges(edges).filter(isFullyConnectedEdge);
  const obstacles = sanitizeObstacles(config.obstacles);
  const existingRoutes = sanitizeRoutes(config.existingRoutes ?? []);

  // ── Stage 0b: Dirty tracking ──
  // An edge is re-routed when it was marked dirty, has no cached route, or its
  // geometry hash (which includes the obstacle layout) no longer matches the
  // hash it was routed with. Edges outside this call are never touched, so a
  // caller may route any subset of the document.
  const hasState = !!state;
  const obstacleHash = computeObstacleHash(obstacles);
  const edgeHashes = new Map<string, string>();
  for (const edge of safeEdges) {
    edgeHashes.set(edge.arrowId, `${computePathHash(edge)}#${obstacleHash}`);
  }

  const edgesToRoute = hasState
    ? safeEdges.filter(
        (e) =>
          state.dirtyEdges.has(e.arrowId) ||
          !state.routeCache.has(e.arrowId) ||
          state.pathHashCache.get(e.arrowId) !== edgeHashes.get(e.arrowId),
      )
    : safeEdges;
  const routedIds = new Set(edgesToRoute.map((e) => e.arrowId));
  // Cached, still-valid routes of the edges in this batch.
  const reusableCachedRoutes: Array<{ arrowId: string; points: Point[] }> = [];
  if (hasState) {
    for (const edge of safeEdges) {
      if (routedIds.has(edge.arrowId)) continue;
      reusableCachedRoutes.push({
        arrowId: edge.arrowId,
        points: state.routeCache.get(edge.arrowId)!,
      });
    }
  }

  const edgeByArrowId = new Map(
    safeEdges.map((edge) => [edge.arrowId, edge] as const),
  );

  // ── Stage 1: Parallel offset computation ──
  const parallelInputs: ParallelEdgeDescriptor[] =
    allParallelCandidates ??
    safeEdges.map((edge) => ({
      arrowId: edge.arrowId,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      start: edge.start,
      end: edge.end,
      startHandle: edge.startHandle,
      endHandle: edge.endHandle,
    }));
  const offsets = computeParallelOffsets(parallelInputs, parallelSpacing);

  // ── Stage 2: Build spatial index from existing + cached routes ──
  const seedRoutes = [...existingRoutes, ...reusableCachedRoutes];
  const occupied = buildSegmentSpatialIndex(seedRoutes);

  // ── Stage 3: Congestion map ──
  const congestionMap = hasState
    ? state.congestionMap
    : createCongestionMap(congestionConfig);

  // Seed congestion map with non-dirty routes
  if (!hasState) {
    for (const route of seedRoutes) {
      recordPath(congestionMap, route.arrowId, route.points);
    }
  }

  // ── Stage 4: Route each edge ──
  const routed = new Map<string, Point[]>();
  const routedArrowIds: string[] = [];

  // Include cached routes for the batch's unchanged edges
  for (const { arrowId, points } of reusableCachedRoutes) {
    routed.set(arrowId, points);
  }

  // Build layer-aware candidate penalty
  const layerBoundaryYs = config.layerBoundaryYs;
  const hasLayerAwareness = layerBoundaryYs && layerBoundaryYs.length > 0;

  // Sort for determinism
  const sortedEdges = [...edgesToRoute].sort((a, b) =>
    a.arrowId.localeCompare(b.arrowId),
  );

  for (const edge of sortedEdges) {
    // Remove old congestion data
    if (hasState) {
      removePath(congestionMap, edge.arrowId);
    }

    const crossingPenalty = pathRanking?.crossingPenalty ?? 0;

    // Build candidate penalty combining layer awareness + congestion
    const candidatePenalty = (candidate: Point[]): number => {
      let penalty = 0;

      // Crossing penalty
      if (crossingPenalty > 0) {
        penalty +=
          countPathCrossingsWithSpatialIndex(
            edge.arrowId,
            candidate,
            occupied,
          ) * crossingPenalty;
      }

      // Layer violation penalty
      if (hasLayerAwareness) {
        const startY = edge.start.y;
        const endY = edge.end.y;
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        for (let i = 0; i < candidate.length - 1; i += 1) {
          const segMinY = Math.min(candidate[i].y, candidate[i + 1].y);
          const segMaxY = Math.max(candidate[i].y, candidate[i + 1].y);
          for (const boundaryY of layerBoundaryYs!) {
            if (boundaryY >= minY && boundaryY <= maxY) continue;
            if (segMinY < boundaryY && segMaxY > boundaryY) {
              penalty += 800;
            }
          }
        }
      }

      // Congestion penalty
      if (enableCongestionAwareness) {
        penalty += computePathCongestionPenalty(
          congestionMap,
          candidate,
          congestionConfig,
        );
      }

      return penalty;
    };

    const ignoreIds = new Set<string>();
    if (edge.sourceId) ignoreIds.add(edge.sourceId);
    if (edge.targetId) ignoreIds.add(edge.targetId);

    // ── Per-edge fail-safe routing (Task 5) ──
    let points: Point[];
    try {
      points = routeArrowPoints({
        arrowId: edge.arrowId,
        start: edge.start,
        end: edge.end,
        startHandle: edge.startHandle,
        endHandle: edge.endHandle,
        routePreference: edge.routePreference,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        routingMode: edge.routingMode ?? "orthogonal",
        existingPoints: edge.existingPoints,
        preserveManualBends: Boolean(edge.preserveManualBends),
        obstacles,
        ignoreObstacleIds: Array.from(ignoreIds),
        obstaclePadding,
        parallelOffset: offsets.get(edge.arrowId) ?? 0,
        occupiedSegments: occupied,
        conflictOptions,
        pathRanking,
        candidatePenalty,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[routeWithEngine] Routing failed for '${edge.arrowId}', using straight fallback:`,
          err,
        );
      }
      points = [edge.start, edge.end];
    }

    routed.set(edge.arrowId, points);
    routedArrowIds.push(edge.arrowId);

    // Remember what this route was computed from (see Stage 0b)
    if (hasState) {
      state.pathHashCache.set(edge.arrowId, edgeHashes.get(edge.arrowId)!);
    }

    // Update spatial index and congestion map
    addPathToSegmentSpatialIndex(occupied, edge.arrowId, points);
    recordPath(congestionMap, edge.arrowId, points);
  }

  // "Straight" arrows are user-chosen diagonals: the post-passes below force
  // Manhattan geometry, so they are set aside and re-attached untouched.
  const straightRoutes = new Map<string, Point[]>();
  for (const edge of safeEdges) {
    if (edge.routingMode !== "straight") continue;
    const points = routed.get(edge.arrowId);
    if (!points) continue;
    straightRoutes.set(edge.arrowId, points);
    routed.delete(edge.arrowId);
  }

  // ── Stage 5: Lane assignment ──
  const routeEntries = Array.from(routed.entries()).map(
    ([arrowId, points]) => ({
      arrowId,
      points,
    }),
  );
  const mergedLaneOptions: LaneManagerOptions = {
    laneSpacing: parallelSpacing,
    maxLanes: 4,
    snapToGrid: true,
    gridSize: 16,
    ...laneOptions,
  };
  const laneAssignments = computeLaneAssignments(
    routeEntries,
    mergedLaneOptions,
  );
  if (laneAssignments.length > 0) {
    const laneAdjusted = applyLaneOffsets(routed, laneAssignments);
    laneAdjusted.forEach((points, arrowId) => {
      routed.set(arrowId, points);
    });
  }

  // ── Stage 6: Crossing minimization (lightweight post-pass) ──
  let finalRoutes = routed;
  if (enableCrossingMinimization) {
    const allIgnoreIds = new Set<string>();
    for (const edge of safeEdges) {
      if (edge.sourceId) allIgnoreIds.add(edge.sourceId);
      if (edge.targetId) allIgnoreIds.add(edge.targetId);
    }
    finalRoutes = minimizeCrossings(
      routed,
      obstacles,
      allIgnoreIds,
      crossingOptions,
    );
  }

  // ── Stage 7: Final validation (hard overlap guarantee) ──
  // Build per-edge ignore IDs for normalizer safety checks
  const ignoreObstacleIdsByArrow = new Map<string, Set<string>>();
  for (const edge of safeEdges) {
    const ids = new Set<string>();
    if (edge.sourceId) ids.add(edge.sourceId);
    if (edge.targetId) ids.add(edge.targetId);
    if (ids.size > 0) ignoreObstacleIdsByArrow.set(edge.arrowId, ids);
  }

  // ── Stage 7.5: Path Normalization ──
  // Enforces pixel-perfect Manhattan alignment, grid snapping (16px),
  // shared corridor unification, and stub straightening. Safety-guarded:
  // any transform that introduces obstacle intersection or extra crossings is reverted.
  finalRoutes = normalizeRoutes(finalRoutes, {
    obstacles,
    ignoreObstacleIdsByArrow,
    obstaclePadding,
    gridSize: 16,
    snapToGrid: true,
    corridorTolerance: 2,
    minStubLength: 24,
  });

  const stabilizedRoutes = new Map<string, Point[]>();
  finalRoutes.forEach((points, arrowId) => {
    const edge = edgeByArrowId.get(arrowId);
    if (!edge) {
      stabilizedRoutes.set(arrowId, points);
      return;
    }

    stabilizedRoutes.set(
      arrowId,
      stabilizeArrowRouteEndpoints(
        points,
        edge.start,
        edge.end,
        edge.startHandle,
        edge.endHandle,
        edge.routePreference,
      ),
    );
  });
  straightRoutes.forEach((points, arrowId) => {
    stabilizedRoutes.set(arrowId, points);
  });
  finalRoutes = stabilizedRoutes;

  // ── Stage 8: Hard overlap validation ──
  let validationViolations = 0;
  finalRoutes.forEach((points, arrowId) => {
    const ignoreIds =
      ignoreObstacleIdsByArrow.get(arrowId) ?? new Set<string>();
    if (!validateNoShapeOverlap(points, obstacles, ignoreIds)) {
      validationViolations += 1;
    }
  });

  // Count final crossings for diagnostics
  let crossingCount = 0;
  const crossingIndex = buildSegmentSpatialIndex(
    Array.from(finalRoutes.entries()).map(([arrowId, points]) => ({
      arrowId,
      points,
    })),
  );
  finalRoutes.forEach((points, arrowId) => {
    crossingCount += countPathCrossingsWithSpatialIndex(
      arrowId,
      points,
      crossingIndex,
    );
  });
  // Each crossing is counted from both sides, so divide by 2
  crossingCount = Math.floor(crossingCount / 2);

  // ── Stage 8: Update state ──
  if (hasState) {
    finalRoutes.forEach((points, arrowId) => {
      state.routeCache.set(arrowId, points);
    });
    // Only the edges handled by this call are clean now; dirty flags of arrows
    // outside the batch must survive until they are routed.
    for (const edge of safeEdges) {
      state.dirtyEdges.delete(edge.arrowId);
    }
    state.congestionMap = congestionMap;
  }

  return {
    routes: finalRoutes,
    crossingCount,
    validationViolations,
    routedArrowIds,
  };
};

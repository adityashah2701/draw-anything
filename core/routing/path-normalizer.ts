/**
 * Path Normalizer – Final visual refinement for routed paths.
 *
 * Runs as the LAST stage of the routing pipeline to guarantee:
 * - Perfect Manhattan alignment (no micro-diagonal drift)
 * - Grid-snapped coordinates (configurable, default 16px)
 * - Corridor unification (shared trunks align exactly)
 * - Stub straightening (clean endpoint stubs ≥ minStubLength)
 * - Deterministic output (sorted by arrowId, pure functions)
 *
 * Safety: every transformation validates against obstacles and
 * crossing count. If a transform introduces regression, it reverts.
 */

import { Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  RoutingObstacle,
  pathIntersectsObstacles,
} from "@/core/routing/obstacle-avoidance";
import {
  compressOrthogonalPath,
  orthogonalizePath,
  EPSILON,
} from "@/core/routing/routing-utils";
import { countTotalCrossings } from "@/core/routing/crossing-minimizer";

// ─────────────────── Types ───────────────────

export interface PathNormalizerOptions {
  /** Grid size in pixels for snapping. Default: 16. */
  gridSize?: number;
  /** Whether to snap coordinates to grid. Default: true. */
  snapToGrid?: boolean;
  /** Tolerance for corridor unification (px). Default: 2. */
  corridorTolerance?: number;
  /** Minimum stub length from port before first bend (px). Default: 24. */
  minStubLength?: number;
  /** Obstacles for safety validation. */
  obstacles?: RoutingObstacle[];
  /** Obstacle IDs to ignore per arrow (source/target shapes). */
  ignoreObstacleIdsByArrow?: Map<string, Set<string>>;
  /** Obstacle padding. Default: 12. */
  obstaclePadding?: number;
}

// ─────────────────── Constants ───────────────────

const DEFAULT_GRID_SIZE = 16;
const DEFAULT_CORRIDOR_TOLERANCE = 2;
const DEFAULT_MIN_STUB_LENGTH = 24;
const DEFAULT_OBSTACLE_PADDING = 12;
const MANHATTAN_SNAP_THRESHOLD = 2;

// ─────────────────── 1. Manhattan Enforcement ───────────────────

/**
 * Enforce strict Manhattan alignment.
 * Snaps near-vertical segments to exact vertical, near-horizontal to exact horizontal.
 * Removes zero-length segments.
 */
const enforceManhattan = (points: Point[]): Point[] => {
  if (points.length < 2) return points;

  const result: Point[] = [{ ...points[0] }];

  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1];
    const curr = { ...points[i] };

    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);

    // Near-vertical: snap x to match previous
    if (dx > 0 && dx < MANHATTAN_SNAP_THRESHOLD && dy > dx) {
      curr.x = prev.x;
    }
    // Near-horizontal: snap y to match previous
    if (dy > 0 && dy < MANHATTAN_SNAP_THRESHOLD && dx > dy) {
      curr.y = prev.y;
    }

    // Skip effectively zero-length segments
    if (
      Math.abs(curr.x - prev.x) < EPSILON &&
      Math.abs(curr.y - prev.y) < EPSILON
    )
      continue;

    result.push(curr);
  }

  // Ensure we keep at least start and end
  if (result.length < 2 && points.length >= 2) {
    return [{ ...points[0] }, { ...points[points.length - 1] }];
  }

  return compressOrthogonalPath(result);
};

// ─────────────────── 2. Grid Snapping ───────────────────

const snapValue = (value: number, gridSize: number): number =>
  Math.round(value / gridSize) * gridSize;

/**
 * Snap all internal coordinates to grid.
 * Preserves first and last points (endpoint attachments).
 */
const snapToGrid = (points: Point[], gridSize: number): Point[] => {
  if (points.length <= 2) return points;

  const result = points.map((p, i) => {
    // Preserve endpoints exactly
    if (i === 0 || i === points.length - 1) return { ...p };

    return {
      x: snapValue(p.x, gridSize),
      y: snapValue(p.y, gridSize),
    };
  });

  return compressOrthogonalPath(result);
};

// ─────────────────── 3. Corridor Unification ───────────────────

interface CorridorSegment {
  arrowId: string;
  segmentIndex: number;
  orientation: "horizontal" | "vertical";
  fixedCoord: number;
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Extract orthogonal segments from a path for corridor analysis.
 */
const extractCorridorSegments = (
  arrowId: string,
  points: Point[],
): CorridorSegment[] => {
  const segments: CorridorSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];

    if (from.y === to.y && from.x !== to.x) {
      segments.push({
        arrowId,
        segmentIndex: i,
        orientation: "horizontal",
        fixedCoord: from.y,
        rangeStart: Math.min(from.x, to.x),
        rangeEnd: Math.max(from.x, to.x),
      });
    } else if (from.x === to.x && from.y !== to.y) {
      segments.push({
        arrowId,
        segmentIndex: i,
        orientation: "vertical",
        fixedCoord: from.x,
        rangeStart: Math.min(from.y, to.y),
        rangeEnd: Math.max(from.y, to.y),
      });
    }
  }
  return segments;
};

/**
 * Find groups of segments that should share a corridor.
 * Uses spatial bucketing for O(n) grouping.
 */
const findCorridorGroups = (
  allSegments: CorridorSegment[],
  tolerance: number,
): CorridorSegment[][] => {
  // Bucket by orientation + rounded fixed coordinate
  const buckets = new Map<string, CorridorSegment[]>();

  for (const seg of allSegments) {
    const bucketCoord = Math.round(seg.fixedCoord / tolerance) * tolerance;
    const key = `${seg.orientation}:${bucketCoord}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(seg);
  }

  // Filter to groups with 2+ segments that actually overlap in range
  const groups: CorridorSegment[][] = [];
  for (const [, bucket] of buckets) {
    if (bucket.length < 2) continue;

    // Check that at least some segments overlap in range
    const hasOverlap = bucket.some((a, i) =>
      bucket.some(
        (b, j) =>
          i < j &&
          a.arrowId !== b.arrowId &&
          Math.max(a.rangeStart, b.rangeStart) <
            Math.min(a.rangeEnd, b.rangeEnd),
      ),
    );
    if (hasOverlap) groups.push(bucket);
  }

  return groups;
};

/**
 * Unify corridor segments to a single shared coordinate.
 * Uses the median coordinate for stability.
 */
const unifyCorridors = (
  routes: Map<string, Point[]>,
  tolerance: number,
  gridSize: number,
): Map<string, Point[]> => {
  // Collect all segments across all routes
  const allSegments: CorridorSegment[] = [];
  routes.forEach((points, arrowId) => {
    allSegments.push(...extractCorridorSegments(arrowId, points));
  });

  const groups = findCorridorGroups(allSegments, tolerance);
  if (groups.length === 0) return routes;

  // Build adjustment map: arrowId → segmentIndex → new fixedCoord
  const adjustments = new Map<string, Map<number, number>>();

  for (const group of groups) {
    // Compute unified coordinate: median, snapped to grid
    const coords = group.map((s) => s.fixedCoord).sort((a, b) => a - b);
    const median = coords[Math.floor(coords.length / 2)];
    const unified = snapValue(median, gridSize);

    for (const seg of group) {
      if (Math.abs(seg.fixedCoord - unified) < 0.5) continue; // Already aligned

      if (!adjustments.has(seg.arrowId)) {
        adjustments.set(seg.arrowId, new Map());
      }
      adjustments.get(seg.arrowId)!.set(seg.segmentIndex, unified);
    }
  }

  if (adjustments.size === 0) return routes;

  // Apply adjustments
  const result = new Map<string, Point[]>();
  routes.forEach((points, arrowId) => {
    const arrowAdj = adjustments.get(arrowId);
    if (!arrowAdj || arrowAdj.size === 0) {
      result.set(arrowId, points);
      return;
    }

    const adjusted = points.map((p) => ({ ...p }));
    for (const [segIdx, newCoord] of arrowAdj) {
      if (segIdx >= adjusted.length - 1) continue;

      const from = adjusted[segIdx];
      const to = adjusted[segIdx + 1];

      if (from.y === to.y) {
        // Horizontal segment: adjust y
        adjusted[segIdx] = { ...from, y: newCoord };
        adjusted[segIdx + 1] = { ...to, y: newCoord };
      } else if (from.x === to.x) {
        // Vertical segment: adjust x
        adjusted[segIdx] = { ...from, x: newCoord };
        adjusted[segIdx + 1] = { ...to, x: newCoord };
      }
    }

    result.set(arrowId, compressOrthogonalPath(adjusted));
  });

  return result;
};

// ─────────────────── 4. Stub Straightening ───────────────────

/**
 * Ensure first and last segments extend at least minStubLength
 * straight from the shape port before any bend.
 */
const straightenStubs = (points: Point[], minStubLength: number): Point[] => {
  if (points.length < 3) return points;

  const result = points.map((p) => ({ ...p }));

  // --- Start stub ---
  const startDir = getSegmentDirection(result[0], result[1]);
  if (startDir !== "none") {
    const stubLen = segmentLength(result[0], result[1]);
    if (stubLen < minStubLength && result.length > 2) {
      // Extend the stub to minStubLength
      if (startDir === "horizontal") {
        const sign = result[1].x > result[0].x ? 1 : -1;
        result[1] = { ...result[1], x: result[0].x + sign * minStubLength };
      } else {
        const sign = result[1].y > result[0].y ? 1 : -1;
        result[1] = { ...result[1], y: result[0].y + sign * minStubLength };
      }
    }
  }

  // --- End stub ---
  const lastIdx = result.length - 1;
  const penIdx = result.length - 2;
  const endDir = getSegmentDirection(result[penIdx], result[lastIdx]);
  if (endDir !== "none") {
    const stubLen = segmentLength(result[penIdx], result[lastIdx]);
    if (stubLen < minStubLength && result.length > 2) {
      if (endDir === "horizontal") {
        const sign = result[penIdx].x < result[lastIdx].x ? -1 : 1;
        result[penIdx] = {
          ...result[penIdx],
          x: result[lastIdx].x + sign * minStubLength,
        };
      } else {
        const sign = result[penIdx].y < result[lastIdx].y ? -1 : 1;
        result[penIdx] = {
          ...result[penIdx],
          y: result[lastIdx].y + sign * minStubLength,
        };
      }
    }
  }

  return compressOrthogonalPath(result);
};

const getSegmentDirection = (
  a: Point,
  b: Point,
): "horizontal" | "vertical" | "none" => {
  if (Math.abs(a.y - b.y) < EPSILON && Math.abs(a.x - b.x) >= EPSILON)
    return "horizontal";
  if (Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) >= EPSILON)
    return "vertical";
  return "none";
};

const segmentLength = (a: Point, b: Point): number =>
  Math.abs(b.x - a.x) + Math.abs(b.y - a.y);

// ─────────────────── Safety Validation ───────────────────

/**
 * Validate that a normalized path hasn't introduced regressions.
 * Returns true if the path is safe to use.
 */
const isSafeTransform = (
  original: Point[],
  normalized: Point[],
  arrowId: string,
  allRoutes: Map<string, Point[]>,
  obstacles: RoutingObstacle[],
  ignoreIds: Set<string>,
  obstaclePadding: number,
): boolean => {
  // Check obstacle intersection
  if (
    pathIntersectsObstacles(normalized, obstacles, ignoreIds, obstaclePadding)
  ) {
    return false;
  }

  // Ensure endpoints are preserved
  if (normalized.length < 2) return false;
  const origStart = original[0];
  const origEnd = original[original.length - 1];
  const normStart = normalized[0];
  const normEnd = normalized[normalized.length - 1];

  if (
    Math.abs(normStart.x - origStart.x) > 0.5 ||
    Math.abs(normStart.y - origStart.y) > 0.5 ||
    Math.abs(normEnd.x - origEnd.x) > 0.5 ||
    Math.abs(normEnd.y - origEnd.y) > 0.5
  ) {
    return false;
  }

  // Check crossing count hasn't increased
  const routesBefore = new Map(allRoutes);
  routesBefore.set(arrowId, original);
  const routesAfter = new Map(allRoutes);
  routesAfter.set(arrowId, normalized);

  const crossingsBefore = countTotalCrossings(routesBefore);
  const crossingsAfter = countTotalCrossings(routesAfter);

  if (crossingsAfter > crossingsBefore) {
    return false;
  }

  return true;
};

// ─────────────────── Public API ───────────────────

/**
 * Normalize all routes for perfect visual alignment.
 *
 * Processing order per arrow (sorted by ID for determinism):
 * 1. Enforce strict Manhattan alignment
 * 2. Snap coordinates to grid
 * 3. Straighten endpoint stubs
 * 4. Recompress orthogonal path
 * 5. Validate against obstacles and crossings
 * 6. Accept only if valid, otherwise revert
 *
 * Then globally:
 * 7. Unify shared corridors
 * 8. Re-validate all modified arrows
 */
const normalizeStepOrthogonalize = (points: Point[]): Point[] => {
  // First attempt to fix minor drifts with Manhattan snap logic
  // Then force strict orthogonality
  const stepped = enforceManhattan(points);
  return orthogonalizePath(stepped);
};

export const normalizeRoutes = (
  routes: Map<string, Point[]>,
  options: PathNormalizerOptions = {},
): Map<string, Point[]> => {
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
  const shouldSnap = options.snapToGrid ?? true;
  const corridorTolerance =
    options.corridorTolerance ?? DEFAULT_CORRIDOR_TOLERANCE;
  const minStubLength = options.minStubLength ?? DEFAULT_MIN_STUB_LENGTH;
  const obstacles = options.obstacles ?? [];
  const ignoreIdsByArrow = options.ignoreObstacleIdsByArrow ?? new Map();
  const obstaclePadding = options.obstaclePadding ?? DEFAULT_OBSTACLE_PADDING;

  // ── Per-arrow normalization ──
  const normalized = new Map<string, Point[]>();
  const arrowIds = Array.from(routes.keys()).sort(); // Deterministic order

  for (const arrowId of arrowIds) {
    const original = routes.get(arrowId)!;
    const ignoreIds = ignoreIdsByArrow.get(arrowId) ?? new Set<string>();

    // Step 1: Manhattan enforcement
    let path = enforceManhattan(original);

    // Step 2: Grid snapping
    if (shouldSnap) {
      path = snapToGrid(path, gridSize);
    }

    // Step 3: Stub straightening
    path = straightenStubs(path, minStubLength);

    // Step 4: Re-orthogonalize and compress
    path = normalizeStepOrthogonalize(path);

    // Step 5: Safety check
    if (
      isSafeTransform(
        original,
        path,
        arrowId,
        routes,
        obstacles,
        ignoreIds,
        obstaclePadding,
      )
    ) {
      normalized.set(arrowId, path);
    } else {
      // Revert to original
      normalized.set(arrowId, original);
    }
  }

  // ── Global corridor unification ──
  const unified = unifyCorridors(normalized, corridorTolerance, gridSize);

  // ── Re-validate unified routes ──
  const result = new Map<string, Point[]>();
  for (const arrowId of arrowIds) {
    const beforeUnify = normalized.get(arrowId)!;
    const afterUnify = unified.get(arrowId) ?? beforeUnify;

    if (afterUnify === beforeUnify) {
      result.set(arrowId, afterUnify);
      continue;
    }

    const ignoreIds = ignoreIdsByArrow.get(arrowId) ?? new Set<string>();
    if (
      isSafeTransform(
        beforeUnify,
        afterUnify,
        arrowId,
        unified,
        obstacles,
        ignoreIds,
        obstaclePadding,
      )
    ) {
      result.set(arrowId, afterUnify);
    } else {
      result.set(arrowId, beforeUnify);
    }
  }

  return result;
};

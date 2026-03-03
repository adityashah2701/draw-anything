/**
 * Crossing Minimizer – Post-routing crossing reduction.
 *
 * Design philosophy (per user feedback):
 * - MOST crossing reduction should happen in path scoring (scoring-first)
 * - This module performs lightweight post-pass optimization only
 * - Limited passes (max 3) to avoid instability and jitter
 * - Uses spatial index for O(n) per-segment checks, not O(n²)
 * - All operations are deterministic
 */

import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { expandAabb, segmentBounds } from "@/core/collision/aabb";
import {
  RoutingObstacle,
  pathIntersectsObstacles,
} from "@/core/routing/obstacle-avoidance";
import { orthogonalizePath, EPSILON } from "@/core/routing/routing-utils";

// ─────────────────── Types ───────────────────

interface IndexedSegment {
  arrowId: string;
  segmentIndex: number;
  from: Point;
  to: Point;
  orientation: "horizontal" | "vertical";
  fixedCoord: number;
  rangeStart: number;
  rangeEnd: number;
}

interface CrossingPair {
  segA: IndexedSegment;
  segB: IndexedSegment;
  intersectionPoint: Point;
}

export interface CrossingMinimizerOptions {
  /** Maximum optimization passes. Default: 3. */
  maxPasses?: number;
  /** Shift distance per attempt in pixels. Default: 14. */
  shiftDistance?: number;
  /** Obstacle padding. Default: 12. */
  obstaclePadding?: number;
}

// ─────────────────── Constants ───────────────────

const DEFAULT_MAX_PASSES = 3;
const DEFAULT_SHIFT_DISTANCE = 14;
const DEFAULT_OBSTACLE_PADDING = 12;
const CELL_SIZE = 128;

// ─────────────────── Spatial Index ───────────────────

interface SegmentSpatialGrid {
  cellSize: number;
  cells: Map<string, IndexedSegment[]>;
}

const buildSegmentGrid = (routes: Map<string, Point[]>): SegmentSpatialGrid => {
  const grid: SegmentSpatialGrid = { cellSize: CELL_SIZE, cells: new Map() };

  routes.forEach((points, arrowId) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      const seg = toIndexedSegment(arrowId, points, i);
      if (!seg) continue;

      const bounds = segmentBounds(seg.from, seg.to);
      const minCX = Math.floor(bounds.minX / CELL_SIZE);
      const maxCX = Math.floor(bounds.maxX / CELL_SIZE);
      const minCY = Math.floor(bounds.minY / CELL_SIZE);
      const maxCY = Math.floor(bounds.maxY / CELL_SIZE);

      for (let cx = minCX; cx <= maxCX; cx += 1) {
        for (let cy = minCY; cy <= maxCY; cy += 1) {
          const key = `${cx}:${cy}`;
          if (!grid.cells.has(key)) grid.cells.set(key, []);
          grid.cells.get(key)!.push(seg);
        }
      }
    }
  });

  return grid;
};

const queryGridForCrossings = (
  grid: SegmentSpatialGrid,
  seg: IndexedSegment,
): CrossingPair[] => {
  const bounds = expandAabb(segmentBounds(seg.from, seg.to), 1);
  const minCX = Math.floor(bounds.minX / grid.cellSize);
  const maxCX = Math.floor(bounds.maxX / grid.cellSize);
  const minCY = Math.floor(bounds.minY / grid.cellSize);
  const maxCY = Math.floor(bounds.maxY / grid.cellSize);

  const seen = new Set<string>();
  const crossings: CrossingPair[] = [];

  for (let cx = minCX; cx <= maxCX; cx += 1) {
    for (let cy = minCY; cy <= maxCY; cy += 1) {
      const bucket = grid.cells.get(`${cx}:${cy}`);
      if (!bucket) continue;

      for (const other of bucket) {
        if (other.arrowId === seg.arrowId) continue;
        if (other.orientation === seg.orientation) continue;

        const key = `${seg.arrowId}:${seg.segmentIndex}:${other.arrowId}:${other.segmentIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const crossing = detectCrossing(seg, other);
        if (crossing) crossings.push(crossing);
      }
    }
  }

  return crossings;
};

// ─────────────────── Segment Helpers ───────────────────

const toIndexedSegment = (
  arrowId: string,
  points: Point[],
  index: number,
): IndexedSegment | null => {
  if (index < 0 || index >= points.length - 1) return null;
  const from = points[index];
  const to = points[index + 1];

  if (Math.abs(from.y - to.y) < EPSILON) {
    return {
      arrowId,
      segmentIndex: index,
      from,
      to,
      orientation: "horizontal",
      fixedCoord: from.y,
      rangeStart: Math.min(from.x, to.x),
      rangeEnd: Math.max(from.x, to.x),
    };
  }

  if (Math.abs(from.x - to.x) < EPSILON) {
    return {
      arrowId,
      segmentIndex: index,
      from,
      to,
      orientation: "vertical",
      fixedCoord: from.x,
      rangeStart: Math.min(from.y, to.y),
      rangeEnd: Math.max(from.y, to.y),
    };
  }

  return null;
};

const detectCrossing = (
  a: IndexedSegment,
  b: IndexedSegment,
): CrossingPair | null => {
  if (a.orientation === b.orientation) return null;

  const horiz = a.orientation === "horizontal" ? a : b;
  const vert = a.orientation === "vertical" ? a : b;

  const ix = vert.fixedCoord;
  const iy = horiz.fixedCoord;

  if (ix < horiz.rangeStart || ix > horiz.rangeEnd) return null;
  if (iy < vert.rangeStart || iy > vert.rangeEnd) return null;

  return {
    segA: a,
    segB: b,
    intersectionPoint: { x: ix, y: iy },
  };
};

// ─────────────────── Segment Shifting ───────────────────

const shiftSegment = (
  points: Point[],
  segmentIndex: number,
  offset: number,
): Point[] | null => {
  // Don't shift first or last segment (endpoint stubs)
  if (segmentIndex <= 0 || segmentIndex >= points.length - 2) return null;

  const next = points.map((p) => ({ ...p }));
  const from = next[segmentIndex];
  const to = next[segmentIndex + 1];

  if (Math.abs(from.y - to.y) < EPSILON) {
    // Horizontal segment: shift vertically
    next[segmentIndex] = { ...from, y: from.y + offset };
    next[segmentIndex + 1] = { ...to, y: to.y + offset };
  } else if (Math.abs(from.x - to.x) < EPSILON) {
    // Vertical segment: shift horizontally
    next[segmentIndex] = { ...from, x: from.x + offset };
    next[segmentIndex + 1] = { ...to, x: to.x + offset };
  } else {
    return null;
  }

  return orthogonalizePath(next);
};

// ─────────────────── Public API ───────────────────

/**
 * Count total crossings across all routed paths.
 * Uses spatial indexing for efficiency.
 */
export const countTotalCrossings = (routes: Map<string, Point[]>): number => {
  const grid = buildSegmentGrid(routes);
  const counted = new Set<string>();
  let total = 0;

  routes.forEach((points, arrowId) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      const seg = toIndexedSegment(arrowId, points, i);
      if (!seg) continue;

      const crossings = queryGridForCrossings(grid, seg);
      for (const crossing of crossings) {
        // Deduplicate: use canonical key
        const key =
          crossing.segA.arrowId < crossing.segB.arrowId
            ? `${crossing.segA.arrowId}:${crossing.segA.segmentIndex}|${crossing.segB.arrowId}:${crossing.segB.segmentIndex}`
            : `${crossing.segB.arrowId}:${crossing.segB.segmentIndex}|${crossing.segA.arrowId}:${crossing.segA.segmentIndex}`;
        if (counted.has(key)) continue;
        counted.add(key);
        total += 1;
      }
    }
  });

  return total;
};

/**
 * Perform lightweight crossing minimization on routed paths.
 *
 * Strategy:
 * 1. Build spatial index of all segments
 * 2. Find crossings
 * 3. For each crossing, try shifting the smaller segment
 * 4. Accept shift only if it reduces total crossings and doesn't
 *    create obstacle intersections
 *
 * Limited to maxPasses to ensure determinism and stability.
 */
export const minimizeCrossings = (
  routes: Map<string, Point[]>,
  obstacles: RoutingObstacle[] = [],
  ignoreObstacleIds: Set<string> = new Set(),
  options: CrossingMinimizerOptions = {},
): Map<string, Point[]> => {
  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES;
  const shiftDistance = options.shiftDistance ?? DEFAULT_SHIFT_DISTANCE;
  const obstaclePadding = options.obstaclePadding ?? DEFAULT_OBSTACLE_PADDING;

  const result = new Map<string, Point[]>();
  routes.forEach((points, id) => result.set(id, [...points]));

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;
    const grid = buildSegmentGrid(result);
    const baseCrossings = countTotalCrossings(result);

    if (baseCrossings === 0) break;

    // Process arrows in deterministic order
    const arrowIds = Array.from(result.keys()).sort();

    for (const arrowId of arrowIds) {
      const points = result.get(arrowId)!;
      if (points.length < 4) continue;

      for (let i = 1; i < points.length - 2; i += 1) {
        const seg = toIndexedSegment(arrowId, points, i);
        if (!seg) continue;

        const segCrossings = queryGridForCrossings(grid, seg);
        if (segCrossings.length === 0) continue;

        // Try shifting in both directions
        let bestPath: Point[] | null = null;
        let bestCrossingCount = baseCrossings;

        for (const direction of [-1, 1] as const) {
          const shifted = shiftSegment(points, i, shiftDistance * direction);
          if (!shifted) continue;

          // Validate no obstacle intersection
          if (
            pathIntersectsObstacles(
              shifted,
              obstacles,
              ignoreObstacleIds,
              obstaclePadding,
            )
          ) {
            continue;
          }

          // Count crossings with this change
          const testRoutes = new Map(result);
          testRoutes.set(arrowId, shifted);
          const newCrossings = countTotalCrossings(testRoutes);

          if (newCrossings < bestCrossingCount) {
            bestCrossingCount = newCrossings;
            bestPath = shifted;
          }
        }

        if (bestPath) {
          result.set(arrowId, bestPath);
          improved = true;
          break; // Only one fix per arrow per pass for stability
        }
      }
    }

    if (!improved) break;
  }

  return result;
};

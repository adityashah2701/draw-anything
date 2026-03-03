/**
 * Congestion Map – Segment heat-map for traffic-aware routing.
 *
 * Tracks how many arrow segments pass through each spatial cell.
 * Used to penalize routing through high-traffic zones, encouraging
 * arrows to spread across available space.
 *
 * Uses the same spatial hashing approach as segment-conflict-resolver
 * for O(1) per-query performance.
 */

import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { Aabb, expandAabb, segmentBounds } from "@/core/collision/aabb";

// ─────────────────── Types ───────────────────

export interface CongestionMap {
  /** Size of each spatial cell in pixels. */
  cellSize: number;
  /** Map from cell key to traffic count. */
  cells: Map<string, number>;
  /** Track which arrows contributed to each cell for incremental updates. */
  arrowCells: Map<string, Set<string>>;
}

export interface CongestionConfig {
  /** Size of spatial cells in pixels. Default: 64. */
  cellSize?: number;
  /** Penalty multiplier per congestion unit. Default: 150. */
  penaltyPerUnit?: number;
  /** Congestion threshold below which no penalty applies. Default: 1. */
  freeThreshold?: number;
}

// ─────────────────── Constants ───────────────────

const DEFAULT_CELL_SIZE = 64;
const DEFAULT_PENALTY_PER_UNIT = 150;
const DEFAULT_FREE_THRESHOLD = 1;

// ─────────────────── Cell Key Helpers ───────────────────

const cellKey = (cx: number, cy: number): string => `${cx}:${cy}`;

const getCellRange = (
  bounds: Aabb,
  cellSize: number,
): { minCX: number; minCY: number; maxCX: number; maxCY: number } => ({
  minCX: Math.floor(bounds.minX / cellSize),
  minCY: Math.floor(bounds.minY / cellSize),
  maxCX: Math.floor(bounds.maxX / cellSize),
  maxCY: Math.floor(bounds.maxY / cellSize),
});

// ─────────────────── Public API ───────────────────

/**
 * Create an empty congestion map.
 */
export const createCongestionMap = (
  config: CongestionConfig = {},
): CongestionMap => ({
  cellSize: config.cellSize ?? DEFAULT_CELL_SIZE,
  cells: new Map<string, number>(),
  arrowCells: new Map<string, Set<string>>(),
});

/**
 * Record a routed path into the congestion map.
 * Increments traffic count for all cells the path passes through.
 */
export const recordPath = (
  map: CongestionMap,
  arrowId: string,
  points: Point[],
): void => {
  // Remove previous recording for this arrow (incremental update)
  removePath(map, arrowId);

  const touchedCells = new Set<string>();

  for (let i = 0; i < points.length - 1; i += 1) {
    const bounds = expandAabb(segmentBounds(points[i], points[i + 1]), 1);
    const range = getCellRange(bounds, map.cellSize);

    for (let cx = range.minCX; cx <= range.maxCX; cx += 1) {
      for (let cy = range.minCY; cy <= range.maxCY; cy += 1) {
        const key = cellKey(cx, cy);
        if (!touchedCells.has(key)) {
          touchedCells.add(key);
          map.cells.set(key, (map.cells.get(key) ?? 0) + 1);
        }
      }
    }
  }

  map.arrowCells.set(arrowId, touchedCells);
};

/**
 * Remove a previously recorded path from the congestion map.
 * Used for incremental updates when an arrow is re-routed.
 */
export const removePath = (map: CongestionMap, arrowId: string): void => {
  const previousCells = map.arrowCells.get(arrowId);
  if (!previousCells) return;

  for (const key of previousCells) {
    const current = map.cells.get(key) ?? 0;
    if (current <= 1) {
      map.cells.delete(key);
    } else {
      map.cells.set(key, current - 1);
    }
  }

  map.arrowCells.delete(arrowId);
};

/**
 * Get the congestion level for a specific cell.
 */
export const getCellCongestion = (
  map: CongestionMap,
  x: number,
  y: number,
): number => {
  const cx = Math.floor(x / map.cellSize);
  const cy = Math.floor(y / map.cellSize);
  return map.cells.get(cellKey(cx, cy)) ?? 0;
};

/**
 * Compute a congestion penalty for an entire candidate path.
 * Sums the congestion of all cells the path passes through,
 * only penalizing cells above the free threshold.
 *
 * Pure function: does not modify the congestion map.
 */
export const computePathCongestionPenalty = (
  map: CongestionMap,
  points: Point[],
  config: CongestionConfig = {},
): number => {
  const penaltyPerUnit = config.penaltyPerUnit ?? DEFAULT_PENALTY_PER_UNIT;
  const freeThreshold = config.freeThreshold ?? DEFAULT_FREE_THRESHOLD;

  let totalPenalty = 0;
  const counted = new Set<string>();

  for (let i = 0; i < points.length - 1; i += 1) {
    const bounds = expandAabb(segmentBounds(points[i], points[i + 1]), 1);
    const range = getCellRange(bounds, map.cellSize);

    for (let cx = range.minCX; cx <= range.maxCX; cx += 1) {
      for (let cy = range.minCY; cy <= range.maxCY; cy += 1) {
        const key = cellKey(cx, cy);
        if (counted.has(key)) continue;
        counted.add(key);

        const congestion = map.cells.get(key) ?? 0;
        if (congestion > freeThreshold) {
          totalPenalty += (congestion - freeThreshold) * penaltyPerUnit;
        }
      }
    }
  }

  return totalPenalty;
};

/**
 * Build a congestion map from a set of already-routed paths.
 */
export const buildCongestionMap = (
  routes: Array<{ arrowId: string; points: Point[] }>,
  config: CongestionConfig = {},
): CongestionMap => {
  const map = createCongestionMap(config);
  for (const route of routes) {
    recordPath(map, route.arrowId, route.points);
  }
  return map;
};

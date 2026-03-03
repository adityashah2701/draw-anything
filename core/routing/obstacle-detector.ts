/**
 * Obstacle Detector – Spatial-indexed obstacle management.
 *
 * Provides efficient obstacle lookup and path clearance validation
 * using spatial hashing. Extracted from the inline checks in
 * obstacle-avoidance.ts for reuse across the routing pipeline.
 *
 * Guarantees:
 * - Minimum spacing of 12–16px between arrows and shape bodies
 * - Paths never pass through their own source shape body
 * - All validation is pure and deterministic
 */

import { Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  Aabb,
  expandAabb,
  intersectsAabb,
  segmentBounds,
  segmentIntersectsAabb,
} from "@/core/collision/aabb";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";

// ─────────────────── Types ───────────────────

export interface ObstacleIndex {
  cellSize: number;
  cells: Map<string, ObstacleEntry[]>;
  allObstacles: RoutingObstacle[];
}

interface ObstacleEntry {
  obstacle: RoutingObstacle;
  expandedBounds: Aabb;
}

export interface ClearanceResult {
  /** Whether the path has sufficient clearance from all obstacles. */
  clear: boolean;
  /** List of obstacle IDs that are too close. */
  violatingIds: string[];
  /** Minimum clearance found (in pixels). */
  minClearance: number;
}

// ─────────────────── Constants ───────────────────

const DEFAULT_CELL_SIZE = 128;
const MIN_ARROW_SPACING = 12;

// ─────────────────── Internal Helpers ───────────────────

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
 * Build a spatial index from a list of obstacles.
 * Obstacles are expanded by the given padding for efficient querying.
 */
export const buildObstacleIndex = (
  obstacles: RoutingObstacle[],
  padding: number = MIN_ARROW_SPACING,
  cellSize: number = DEFAULT_CELL_SIZE,
): ObstacleIndex => {
  const index: ObstacleIndex = {
    cellSize,
    cells: new Map(),
    allObstacles: obstacles,
  };

  for (const obstacle of obstacles) {
    const expanded = expandAabb(obstacle.bounds, padding);
    const entry: ObstacleEntry = { obstacle, expandedBounds: expanded };
    const range = getCellRange(expanded, cellSize);

    for (let cx = range.minCX; cx <= range.maxCX; cx += 1) {
      for (let cy = range.minCY; cy <= range.maxCY; cy += 1) {
        const key = cellKey(cx, cy);
        if (!index.cells.has(key)) {
          index.cells.set(key, []);
        }
        index.cells.get(key)!.push(entry);
      }
    }
  }

  return index;
};

/**
 * Query all obstacles whose expanded bounds intersect the given area.
 * Returns deduplicated results.
 */
export const queryNearbyObstacles = (
  index: ObstacleIndex,
  bounds: Aabb,
): RoutingObstacle[] => {
  const range = getCellRange(bounds, index.cellSize);
  const seen = new Set<string>();
  const results: RoutingObstacle[] = [];

  for (let cx = range.minCX; cx <= range.maxCX; cx += 1) {
    for (let cy = range.minCY; cy <= range.maxCY; cy += 1) {
      const bucket = index.cells.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry.obstacle.id)) continue;
        seen.add(entry.obstacle.id);
        if (intersectsAabb(bounds, entry.expandedBounds)) {
          results.push(entry.obstacle);
        }
      }
    }
  }

  return results;
};

/**
 * Validate that a path maintains minimum clearance from all obstacles.
 *
 * Returns a detailed clearance result including which obstacles are
 * violated and the minimum clearance found.
 */
export const validatePathClearance = (
  path: Point[],
  index: ObstacleIndex,
  ignoreIds: Set<string>,
  minSpacing: number = MIN_ARROW_SPACING,
): ClearanceResult => {
  if (path.length < 2)
    return { clear: true, violatingIds: [], minClearance: Infinity };

  const violatingIds: string[] = [];
  let minClearance = Infinity;

  for (let i = 0; i < path.length - 1; i += 1) {
    const segBounds = expandAabb(
      segmentBounds(path[i], path[i + 1]),
      minSpacing,
    );
    const nearby = queryNearbyObstacles(index, segBounds);

    for (const obstacle of nearby) {
      if (ignoreIds.has(obstacle.id)) continue;

      const expanded = expandAabb(obstacle.bounds, minSpacing);
      if (segmentIntersectsAabb(path[i], path[i + 1], expanded)) {
        if (!violatingIds.includes(obstacle.id)) {
          violatingIds.push(obstacle.id);
        }

        // Estimate clearance (simplified: use center distance)
        const segCX = (path[i].x + path[i + 1].x) / 2;
        const segCY = (path[i].y + path[i + 1].y) / 2;
        const obsCX = (obstacle.bounds.minX + obstacle.bounds.maxX) / 2;
        const obsCY = (obstacle.bounds.minY + obstacle.bounds.maxY) / 2;
        const dist = Math.abs(segCX - obsCX) + Math.abs(segCY - obsCY);
        const halfWidth = (obstacle.bounds.maxX - obstacle.bounds.minX) / 2;
        const halfHeight = (obstacle.bounds.maxY - obstacle.bounds.minY) / 2;
        const clearance = Math.max(0, dist - halfWidth - halfHeight);
        minClearance = Math.min(minClearance, clearance);
      }
    }
  }

  return {
    clear: violatingIds.length === 0,
    violatingIds,
    minClearance: violatingIds.length === 0 ? Infinity : minClearance,
  };
};

/**
 * Hard validation: checks if any path segment intersects an obstacle body.
 * This is the final zero-overlap guarantee gate.
 * Returns true if the path is clean (no overlaps).
 */
export const validateNoShapeOverlap = (
  path: Point[],
  obstacles: RoutingObstacle[],
  ignoreIds: Set<string>,
): boolean => {
  if (path.length < 2) return true;

  for (let i = 0; i < path.length - 1; i += 1) {
    for (const obstacle of obstacles) {
      if (ignoreIds.has(obstacle.id)) continue;
      if (segmentIntersectsAabb(path[i], path[i + 1], obstacle.bounds)) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Check if two paths have any segments that overlap (arrows overlapping arrows).
 * Uses bounding-box checks for early rejection.
 */
export const checkArrowOverlap = (
  pathA: Point[],
  pathB: Point[],
  tolerance: number = 2,
): boolean => {
  for (let i = 0; i < pathA.length - 1; i += 1) {
    const aBounds = expandAabb(
      segmentBounds(pathA[i], pathA[i + 1]),
      tolerance,
    );
    for (let j = 0; j < pathB.length - 1; j += 1) {
      const bBounds = segmentBounds(pathB[j], pathB[j + 1]);
      if (!intersectsAabb(aBounds, bBounds)) continue;

      // Check if segments are collinear and overlapping
      const aHoriz = pathA[i].y === pathA[i + 1].y;
      const bHoriz = pathB[j].y === pathB[j + 1].y;
      const aVert = pathA[i].x === pathA[i + 1].x;
      const bVert = pathB[j].x === pathB[j + 1].x;

      if (aHoriz && bHoriz && Math.abs(pathA[i].y - pathB[j].y) <= tolerance) {
        const aMin = Math.min(pathA[i].x, pathA[i + 1].x);
        const aMax = Math.max(pathA[i].x, pathA[i + 1].x);
        const bMin = Math.min(pathB[j].x, pathB[j + 1].x);
        const bMax = Math.max(pathB[j].x, pathB[j + 1].x);
        if (aMax > bMin && bMax > aMin) return true;
      }

      if (aVert && bVert && Math.abs(pathA[i].x - pathB[j].x) <= tolerance) {
        const aMin = Math.min(pathA[i].y, pathA[i + 1].y);
        const aMax = Math.max(pathA[i].y, pathA[i + 1].y);
        const bMin = Math.min(pathB[j].y, pathB[j + 1].y);
        const bMax = Math.max(pathB[j].y, pathB[j + 1].y);
        if (aMax > bMin && bMax > aMin) return true;
      }
    }
  }
  return false;
};

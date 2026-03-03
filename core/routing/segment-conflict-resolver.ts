import {
  Aabb,
  expandAabb,
  intersectsAabb,
  segmentBounds,
} from "@/core/collision/aabb";
import {
  RoutingObstacle,
  pathIntersectsObstacles,
} from "@/core/routing/obstacle-avoidance";
import {
  compressOrthogonalPath,
  orthogonalizePath,
  EPSILON,
} from "@/core/routing/routing-utils";
import { Point } from "@/features/whiteboard/types/whiteboard.types";

type SegmentOrientation = "horizontal" | "vertical";

interface RoutedSegment {
  arrowId: string;
  from: Point;
  to: Point;
  orientation: SegmentOrientation;
  index: number;
  rangeStart: number;
  rangeEnd: number;
  fixedCoord: number;
}

interface SegmentCellEntry {
  segment: RoutedSegment;
  bounds: Aabb;
}

export interface SegmentConflictOptions {
  spacing?: number;
  maxShiftSteps?: number;
  minOverlapLength?: number;
  collisionPadding?: number;
}

export interface SegmentSpatialIndex {
  cellSize: number;
  cells: Map<string, SegmentCellEntry[]>;
}

const DEFAULT_CELL_SIZE = 128;
const DEFAULT_CONFLICT_SPACING = 14;
const DEFAULT_MAX_SHIFT_STEPS = 4;
const DEFAULT_MIN_OVERLAP = 8;
const DEFAULT_COLLISION_PADDING = 1;

const toSegment = (
  arrowId: string,
  points: Point[],
  index: number,
): RoutedSegment | null => {
  if (index < 0 || index >= points.length - 1) return null;
  const from = points[index];
  const to = points[index + 1];
  if (from.x === to.x && from.y === to.y) return null;

  if (Math.abs(from.y - to.y) < EPSILON) {
    const rangeStart = Math.min(from.x, to.x);
    const rangeEnd = Math.max(from.x, to.x);
    return {
      arrowId,
      from,
      to,
      orientation: "horizontal",
      index,
      rangeStart,
      rangeEnd,
      fixedCoord: from.y,
    };
  }

  if (Math.abs(from.x - to.x) < EPSILON) {
    const rangeStart = Math.min(from.y, to.y);
    const rangeEnd = Math.max(from.y, to.y);
    return {
      arrowId,
      from,
      to,
      orientation: "vertical",
      index,
      rangeStart,
      rangeEnd,
      fixedCoord: from.x,
    };
  }

  return null;
};

const addSegmentToIndex = (
  index: SegmentSpatialIndex,
  segment: RoutedSegment,
  padding = DEFAULT_COLLISION_PADDING,
) => {
  const bounds = expandAabb(segmentBounds(segment.from, segment.to), padding);
  const minCellX = Math.floor(bounds.minX / index.cellSize);
  const maxCellX = Math.floor(bounds.maxX / index.cellSize);
  const minCellY = Math.floor(bounds.minY / index.cellSize);
  const maxCellY = Math.floor(bounds.maxY / index.cellSize);

  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      const key = `${cx}:${cy}`;
      if (!index.cells.has(key)) {
        index.cells.set(key, []);
      }
      index.cells.get(key)!.push({ segment, bounds });
    }
  }
};

const querySegments = (
  index: SegmentSpatialIndex,
  bounds: Aabb,
): SegmentCellEntry[] => {
  const minCellX = Math.floor(bounds.minX / index.cellSize);
  const maxCellX = Math.floor(bounds.maxX / index.cellSize);
  const minCellY = Math.floor(bounds.minY / index.cellSize);
  const maxCellY = Math.floor(bounds.maxY / index.cellSize);
  const unique = new Map<string, SegmentCellEntry>();

  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      const bucket = index.cells.get(`${cx}:${cy}`);
      if (!bucket) continue;
      bucket.forEach((entry) => {
        const key = `${entry.segment.arrowId}:${entry.segment.index}`;
        if (!unique.has(key)) {
          unique.set(key, entry);
        }
      });
    }
  }

  return Array.from(unique.values());
};

const overlapLength = (a: RoutedSegment, b: RoutedSegment): number => {
  const start = Math.max(a.rangeStart, b.rangeStart);
  const end = Math.min(a.rangeEnd, b.rangeEnd);
  return Math.max(0, end - start);
};

const isEndpoint = (segment: RoutedSegment, point: Point) =>
  (segment.from.x === point.x && segment.from.y === point.y) ||
  (segment.to.x === point.x && segment.to.y === point.y);

const countSegmentCrossing = (a: RoutedSegment, b: RoutedSegment): number => {
  if (a.orientation === b.orientation) return 0;

  const horizontal = a.orientation === "horizontal" ? a : b;
  const vertical = a.orientation === "vertical" ? a : b;
  const intersection = { x: vertical.fixedCoord, y: horizontal.fixedCoord };
  const withinHorizontal =
    intersection.x >= horizontal.rangeStart &&
    intersection.x <= horizontal.rangeEnd;
  const withinVertical =
    intersection.y >= vertical.rangeStart &&
    intersection.y <= vertical.rangeEnd;

  if (!withinHorizontal || !withinVertical) return 0;
  if (
    isEndpoint(horizontal, intersection) ||
    isEndpoint(vertical, intersection)
  ) {
    return 0;
  }
  return 1;
};

const countConflicts = (
  segment: RoutedSegment,
  index: SegmentSpatialIndex | null,
  minOverlapLength: number,
): number => {
  if (!index) return 0;
  const queryBounds = expandAabb(segmentBounds(segment.from, segment.to), 1);
  const nearby = querySegments(index, queryBounds);
  let conflicts = 0;
  nearby.forEach((entry) => {
    const other = entry.segment;
    if (other.arrowId === segment.arrowId) return;
    if (other.orientation !== segment.orientation) return;
    if (Math.abs(other.fixedCoord - segment.fixedCoord) > 0.5) return;
    if (!intersectsAabb(entry.bounds, queryBounds)) return;
    if (overlapLength(other, segment) >= minOverlapLength) {
      conflicts += 1;
    }
  });
  return conflicts;
};

const moveSegmentBy = (
  points: Point[],
  segmentIndex: number,
  offset: number,
): Point[] => {
  // Allow limited shifting for endpoint-adjacent segments (1 step only).
  if (segmentIndex <= 1 || segmentIndex >= points.length - 3) {
    if (segmentIndex === 0 || segmentIndex >= points.length - 2) return points;
    // For near-endpoint segments, shift at most 1 step with reduced offset.
    const next = points.map((point) => ({ ...point }));
    const from = next[segmentIndex];
    const to = next[segmentIndex + 1];
    const reduced = offset * 0.6;
    if (Math.abs(from.y - to.y) < EPSILON) {
      next[segmentIndex] = { ...from, y: from.y + reduced };
      next[segmentIndex + 1] = { ...to, y: to.y + reduced };
    } else if (Math.abs(from.x - to.x) < EPSILON) {
      next[segmentIndex] = { ...from, x: from.x + reduced };
      next[segmentIndex + 1] = { ...to, x: to.x + reduced };
    }
    return orthogonalizePath(next);
  }
  const next = points.map((point) => ({ ...point }));
  const from = next[segmentIndex];
  const to = next[segmentIndex + 1];
  if (Math.abs(from.y - to.y) < EPSILON) {
    next[segmentIndex] = { ...from, y: from.y + offset };
    next[segmentIndex + 1] = { ...to, y: to.y + offset };
  } else if (Math.abs(from.x - to.x) < EPSILON) {
    next[segmentIndex] = { ...from, x: from.x + offset };
    next[segmentIndex + 1] = { ...to, x: to.x + offset };
  }
  return orthogonalizePath(next);
};

export const createSegmentSpatialIndex = (
  cellSize = DEFAULT_CELL_SIZE,
): SegmentSpatialIndex => ({
  cellSize,
  cells: new Map<string, SegmentCellEntry[]>(),
});

export const addPathToSegmentSpatialIndex = (
  index: SegmentSpatialIndex,
  arrowId: string,
  points: Point[],
) => {
  for (let i = 0; i < points.length - 1; i += 1) {
    const segment = toSegment(arrowId, points, i);
    if (!segment) continue;
    addSegmentToIndex(index, segment);
  }
};

export const buildSegmentSpatialIndex = (
  routes: Array<{ arrowId: string; points: Point[] }>,
  cellSize = DEFAULT_CELL_SIZE,
): SegmentSpatialIndex => {
  const index = createSegmentSpatialIndex(cellSize);
  routes.forEach((route) =>
    addPathToSegmentSpatialIndex(index, route.arrowId, route.points),
  );
  return index;
};

export const countPathCrossingsWithSpatialIndex = (
  arrowId: string,
  path: Point[],
  index: SegmentSpatialIndex | null,
): number => {
  if (!index || path.length < 2) return 0;

  let crossings = 0;
  const seen = new Set<string>();

  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = toSegment(arrowId, path, i);
    if (!segment) continue;

    const queryBounds = expandAabb(segmentBounds(segment.from, segment.to), 1);
    const nearby = querySegments(index, queryBounds);

    nearby.forEach((entry) => {
      const other = entry.segment;
      if (other.arrowId === arrowId) return;
      if (other.orientation === segment.orientation) return;
      if (!intersectsAabb(entry.bounds, queryBounds)) return;

      const key = `${segment.index}:${other.arrowId}:${other.index}`;
      if (seen.has(key)) return;
      seen.add(key);
      crossings += countSegmentCrossing(segment, other);
    });
  }

  return crossings;
};

export const resolvePathSegmentConflicts = ({
  arrowId,
  path,
  occupiedSegments,
  obstacles = [],
  ignoreObstacleIds = [],
  obstaclePadding = 12,
  options = {},
}: {
  arrowId: string;
  path: Point[];
  occupiedSegments?: SegmentSpatialIndex | null;
  obstacles?: RoutingObstacle[];
  ignoreObstacleIds?: string[];
  obstaclePadding?: number;
  options?: SegmentConflictOptions;
}): Point[] => {
  if (!occupiedSegments || path.length < 4) return path;

  const spacing = options.spacing ?? DEFAULT_CONFLICT_SPACING;
  const maxShiftSteps = options.maxShiftSteps ?? DEFAULT_MAX_SHIFT_STEPS;
  const minOverlapLength = options.minOverlapLength ?? DEFAULT_MIN_OVERLAP;
  const ignoreIds = new Set(ignoreObstacleIds);

  let nextPath = compressOrthogonalPath(path);
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (let i = 1; i < nextPath.length - 2; i += 1) {
      const currentSegment = toSegment(arrowId, nextPath, i);
      if (!currentSegment) continue;

      const baseConflicts = countConflicts(
        currentSegment,
        occupiedSegments,
        minOverlapLength,
      );
      if (baseConflicts === 0) continue;

      let bestPath = nextPath;
      let bestConflicts = baseConflicts;
      for (let step = 1; step <= maxShiftSteps; step += 1) {
        for (const direction of [-1, 1] as const) {
          const shifted = moveSegmentBy(
            nextPath,
            i,
            spacing * step * direction,
          );
          const shiftedSegment = toSegment(arrowId, shifted, i);
          if (!shiftedSegment) continue;
          if (
            pathIntersectsObstacles(
              shifted,
              obstacles,
              ignoreIds,
              obstaclePadding,
            )
          ) {
            continue;
          }
          const shiftedConflicts = countConflicts(
            shiftedSegment,
            occupiedSegments,
            minOverlapLength,
          );
          if (shiftedConflicts < bestConflicts) {
            bestConflicts = shiftedConflicts;
            bestPath = shifted;
          }
        }
      }

      if (bestPath !== nextPath) {
        nextPath = bestPath;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return compressOrthogonalPath(nextPath);
};

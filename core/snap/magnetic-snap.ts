import { Anchor, Point, type BoundsLike } from "@/core/model";
import { AnchorIndex } from "@/core/anchors/generate-anchors";
import { squaredDistance } from "@/core/utils/distance";
import { isValidPoint } from "@/core/routing/routing-guards";

export type { BoundsLike };

export interface MagneticSnapMatch {
  elementId: string;
  anchor: Anchor;
  distanceSq: number;
}

export interface FindNearestSnapInput {
  point: Point;
  dragVector?: Point;
  previous?: MagneticSnapMatch | null;
  excludeElementIds?: string[];
  /** World-unit snap distance; callers pass a screen-pixel size divided by zoom. Defaults to `snapRadius`. */
  radius?: number;
}

/** Elements that are never a connection target even though they expose anchors. */
export const NOT_A_TARGET: ReadonlySet<string> = new Set([
  "arrow",
  "bidirectional-arrow",
  "line",
  "freehand",
]);

export interface AnchorGridIndex {
  cellSize: number;
  grid: Map<string, number[]>;
}

export const getCellKey = (x: number, y: number, cellSize: number): string =>
  `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;

export const buildGridIndex = (
  anchors: AnchorIndex["anchors"],
  cellSize: number,
): AnchorGridIndex => {
  const grid = new Map<string, number[]>();

  anchors.forEach((record, index) => {
    if (!record?.anchor || !isValidPoint(record.anchor)) return;
    const key = getCellKey(record.anchor.x, record.anchor.y, cellSize);
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      grid.set(key, [index]);
    }
  });

  return { cellSize, grid };
};

export const getNeighborCandidateIndices = (
  point: Point,
  radius: number,
  gridIndex: AnchorGridIndex,
): number[] => {
  if (!isValidPoint(point) || !Number.isFinite(radius) || radius <= 0) return [];
  const minCellX = Math.floor((point.x - radius) / gridIndex.cellSize);
  const maxCellX = Math.floor((point.x + radius) / gridIndex.cellSize);
  const minCellY = Math.floor((point.y - radius) / gridIndex.cellSize);
  const maxCellY = Math.floor((point.y + radius) / gridIndex.cellSize);

  const result = new Set<number>();
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      const key = `${cx}:${cy}`;
      const bucket = gridIndex.grid.get(key);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i += 1) {
        result.add(bucket[i]);
      }
    }
  }

  return Array.from(result);
};

export const alignmentPenalty = (
  anchorSide: Anchor["side"],
  dragVector?: Point,
  snapRadius = 20,
): number => {
  if (!dragVector || !isValidPoint(dragVector)) return 0;
  const dx = Math.abs(dragVector.x);
  const dy = Math.abs(dragVector.y);
  if (dx < 1 && dy < 1) return 0;

  const horizontalDominant = dx >= dy;
  const isHorizontalAnchor = anchorSide === "left" || anchorSide === "right";
  if (horizontalDominant === isHorizontalAnchor) return 0;
  return snapRadius * snapRadius * 0.12;
};

export interface PureFindNearestSnapOptions {
  point: Point;
  dragVector?: Point;
  previous?: MagneticSnapMatch | null;
  excludeElementIds?: string[];
  radius: number;
  anchorIndex: AnchorIndex;
  gridIndex: AnchorGridIndex;
  typeById: Map<string, string>;
  useSpatialFiltering: boolean;
}

/**
 * Pure mathematical nearest-anchor finder.
 * Operates without React dependencies so it can run headlessly, in workers, or inside pure domain logic.
 */
export const findNearestAnchorSnapPure = ({
  point,
  dragVector,
  previous,
  excludeElementIds,
  radius,
  anchorIndex,
  gridIndex,
  typeById,
  useSpatialFiltering,
}: PureFindNearestSnapOptions): MagneticSnapMatch | null => {
  if (!isValidPoint(point)) {
    return null;
  }

  const snapRadiusSq = radius * radius;
  const hysteresisRadiusSq = radius * 1.35 * (radius * 1.35);
  const excludedIds = new Set(excludeElementIds ?? []);

  if (previous && isValidPoint(previous.anchor)) {
    const prevDistSq = squaredDistance(point, previous.anchor);
    if (prevDistSq <= hysteresisRadiusSq) {
      return { ...previous, distanceSq: prevDistSq };
    }
  }

  const candidateIndices = useSpatialFiltering
    ? getNeighborCandidateIndices(point, radius, gridIndex)
    : anchorIndex.anchors.map((_, index) => index);

  let best: MagneticSnapMatch | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let c = 0; c < candidateIndices.length; c += 1) {
    const index = candidateIndices[c];
    const record = anchorIndex.anchors[index];
    if (!record || !isValidPoint(record.anchor)) continue;
    if (excludedIds.has(record.elementId)) continue;

    const distSq = squaredDistance(point, record.anchor);
    if (distSq > snapRadiusSq) continue;

    const flickerPenalty =
      previous && previous.anchor.id !== record.anchor.id
        ? snapRadiusSq * 0.08
        : 0;

    const score =
      distSq +
      alignmentPenalty(record.anchor.side, dragVector, radius) +
      flickerPenalty;

    if (score < bestScore) {
      bestScore = score;
      best = {
        elementId: record.elementId,
        anchor: record.anchor,
        distanceSq: distSq,
      };
    }
  }

  if (best) return best;

  // Pointer over a shape's body (or within `radius` of it): attach to the nearest of its anchors.
  for (let i = anchorIndex.shapes.length - 1; i >= 0; i -= 1) {
    const shape = anchorIndex.shapes[i];
    if (!shape || !shape.bounds) continue;
    const { x: minX, y: minY } = shape.bounds;
    const maxX = minX + shape.bounds.width;
    const maxY = minY + shape.bounds.height;
    if (
      excludedIds.has(shape.id) ||
      NOT_A_TARGET.has(typeById.get(shape.id) ?? "") ||
      point.x < minX - radius ||
      point.x > maxX + radius ||
      point.y < minY - radius ||
      point.y > maxY + radius
    ) {
      continue;
    }
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const anchor of shape.anchors) {
      if (!isValidPoint(anchor)) continue;
      const distSq = squaredDistance(point, anchor);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = { elementId: shape.id, anchor, distanceSq: distSq };
      }
    }
    if (best) return best; // topmost shape wins
  }

  return null;
};


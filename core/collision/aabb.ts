import { Point } from "@/features/whiteboard/types/whiteboard.types";

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EPSILON = 0.0001;

export const toAabb = (bounds: Aabb): Aabb => ({
  minX: Math.min(bounds.minX, bounds.maxX),
  minY: Math.min(bounds.minY, bounds.maxY),
  maxX: Math.max(bounds.minX, bounds.maxX),
  maxY: Math.max(bounds.minY, bounds.maxY),
});

export const expandAabb = (box: Aabb, margin: number): Aabb => ({
  minX: box.minX - margin,
  minY: box.minY - margin,
  maxX: box.maxX + margin,
  maxY: box.maxY + margin,
});

export const intersectsAabb = (a: Aabb, b: Aabb): boolean =>
  a.minX <= b.maxX &&
  a.maxX >= b.minX &&
  a.minY <= b.maxY &&
  a.maxY >= b.minY;

export const containsPoint = (box: Aabb, point: Point): boolean =>
  point.x >= box.minX - EPSILON &&
  point.x <= box.maxX + EPSILON &&
  point.y >= box.minY - EPSILON &&
  point.y <= box.maxY + EPSILON;

export const segmentBounds = (a: Point, b: Point): Aabb => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
});

export const segmentIntersectsAabb = (
  a: Point,
  b: Point,
  box: Aabb,
): boolean => {
  const normalized = toAabb(box);
  const segBox = segmentBounds(a, b);
  if (!intersectsAabb(segBox, normalized)) return false;

  if (a.x === b.x) {
    const x = a.x;
    if (x < normalized.minX - EPSILON || x > normalized.maxX + EPSILON) {
      return false;
    }
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return hi >= normalized.minY - EPSILON && lo <= normalized.maxY + EPSILON;
  }

  if (a.y === b.y) {
    const y = a.y;
    if (y < normalized.minY - EPSILON || y > normalized.maxY + EPSILON) {
      return false;
    }
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi >= normalized.minX - EPSILON && lo <= normalized.maxX + EPSILON;
  }

  return false;
};

export const pathIntersectsAabb = (
  points: Point[],
  box: Aabb,
  ignoreEndpoints = false,
): boolean => {
  if (points.length < 2) return false;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];

    if (
      ignoreEndpoints &&
      ((containsPoint(box, from) && (from === first || from === last)) ||
        (containsPoint(box, to) && (to === first || to === last)))
    ) {
      continue;
    }

    if (segmentIntersectsAabb(from, to, box)) {
      return true;
    }
  }
  return false;
};

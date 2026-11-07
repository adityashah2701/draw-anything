import type { Point } from "@/features/whiteboard/types/whiteboard.types";

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EPS = 1e-6;

export const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
  Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

/** Boxes overlap by more than a hair, so touching boxes do not count. */
export const overlaps = (a: Box, b: Box) => overlapArea(a, b) > 1;

export const inset = (b: Box, by: number): Box => ({
  minX: b.minX + by,
  minY: b.minY + by,
  maxX: b.maxX - by,
  maxY: b.maxY - by,
});

export const expand = (b: Box, by: number): Box => inset(b, -by);

/** True when the segment p-q passes through the interior of `box`. Exact for orthogonal segments. */
export const segmentHitsBox = (p: Point, q: Point, box: Box) => {
  const minX = Math.min(p.x, q.x);
  const maxX = Math.max(p.x, q.x);
  const minY = Math.min(p.y, q.y);
  const maxY = Math.max(p.y, q.y);
  if (Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS) {
    return minX < box.maxX && maxX > box.minX && minY < box.maxY && maxY > box.minY;
  }
  for (let i = 0; i <= 20; i += 1) {
    const x = p.x + ((q.x - p.x) * i) / 20;
    const y = p.y + ((q.y - p.y) * i) / 20;
    if (x > box.minX && x < box.maxX && y > box.minY && y < box.maxY) return true;
  }
  return false;
};

/** Proper crossing of two orthogonal segments (one horizontal, one vertical, interiors meet). */
export const segmentsCross = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  const aH = Math.abs(a1.y - a2.y) < EPS;
  const aV = Math.abs(a1.x - a2.x) < EPS;
  const bH = Math.abs(b1.y - b2.y) < EPS;
  const bV = Math.abs(b1.x - b2.x) < EPS;
  const between = (v: number, p: number, q: number) => v > Math.min(p, q) + 0.5 && v < Math.max(p, q) - 0.5;
  if (aH && bV) return between(b1.x, a1.x, a2.x) && between(a1.y, b1.y, b2.y);
  if (aV && bH) return between(a1.x, b1.x, b2.x) && between(b1.y, a1.y, a2.y);
  return false;
};

/** Shared length of two collinear orthogonal segments (0 when they are not on the same line). */
export const collinearOverlap = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  if (Math.abs(a1.y - a2.y) < EPS && Math.abs(b1.y - b2.y) < EPS && Math.abs(a1.y - b1.y) < 1) {
    return Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
  }
  if (Math.abs(a1.x - a2.x) < EPS && Math.abs(b1.x - b2.x) < EPS && Math.abs(a1.x - b1.x) < 1) {
    return Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
  }
  return 0;
};

export const pathLength = (points: Point[]) => {
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return length;
};

export const pathHitsBox = (points: Point[], box: Box) =>
  points.slice(0, -1).some((p, i) => segmentHitsBox(p, points[i + 1], box));

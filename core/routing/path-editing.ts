import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import { compressOrthogonalPath } from "@/core/routing/routing-utils";

export const insertBendPoint = (
  points: Point[],
  segmentIndex: number,
): Point[] => {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) {
    return points;
  }
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return [
    ...points.slice(0, segmentIndex + 1),
    midpoint,
    ...points.slice(segmentIndex + 1),
  ];
};

export const removeBendPoint = (
  points: Point[],
  bendIndex: number,
): Point[] => {
  if (points.length <= 2 || bendIndex <= 0 || bendIndex >= points.length - 1) {
    return points;
  }
  const next = [...points];
  next.splice(bendIndex, 1);
  return compressOrthogonalPath(next);
};

export const moveOrthogonalSegment = (
  points: Point[],
  segmentIndex: number,
  target: Point,
): Point[] => {
  const lastSegment = points.length - 2;
  if (points.length < 3 || segmentIndex <= 0 || segmentIndex >= lastSegment) {
    return points;
  }

  const next = points.map((point) => ({ ...point }));
  const from = next[segmentIndex];
  const to = next[segmentIndex + 1];
  if (from.y === to.y) {
    next[segmentIndex] = { ...next[segmentIndex], y: target.y };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], y: target.y };
  } else if (from.x === to.x) {
    next[segmentIndex] = { ...next[segmentIndex], x: target.x };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], x: target.x };
  }
  return compressOrthogonalPath(next);
};


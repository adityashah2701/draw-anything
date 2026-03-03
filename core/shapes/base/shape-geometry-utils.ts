import { Point } from "@/features/whiteboard/types/whiteboard.types";

export const distanceToSegment = (point: Point, from: Point, to: Point): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq),
  );

  const projectionX = from.x + t * dx;
  const projectionY = from.y + t * dy;
  return Math.hypot(point.x - projectionX, point.y - projectionY);
};

export const isPointNearPolyline = (
  point: Point,
  polyline: Point[],
  tolerance: number,
): boolean => {
  if (polyline.length === 0) return false;
  if (polyline.length === 1) {
    return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y) <= tolerance;
  }

  for (let i = 0; i < polyline.length - 1; i += 1) {
    if (distanceToSegment(point, polyline[i], polyline[i + 1]) <= tolerance) {
      return true;
    }
  }

  return false;
};

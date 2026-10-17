import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import { insertBendPoint, removeBendPoint } from "@/core/routing/path-editing";

const REMOVE_RADIUS_PX = 10;
const INSERT_RADIUS_PX = 12;

const distanceToOrthogonalSegment = (from: Point, to: Point, point: Point) => {
  if (from.x === to.x) {
    const outside = point.y < Math.min(from.y, to.y) || point.y > Math.max(from.y, to.y);
    return Math.abs(point.x - from.x) + (outside ? Math.min(Math.abs(point.y - from.y), Math.abs(point.y - to.y)) : 0);
  }
  const outside = point.x < Math.min(from.x, to.x) || point.x > Math.max(from.x, to.x);
  return Math.abs(point.y - from.y) + (outside ? Math.min(Math.abs(point.x - from.x), Math.abs(point.x - to.x)) : 0);
};

/** Double-click on an arrow: remove the bend under the pointer, else add one on the nearest segment; null when neither applies. */
export const editBendAtPoint = (points: Point[], point: Point, zoom: number): Point[] | null => {
  const removeThreshold = REMOVE_RADIUS_PX / zoom;
  for (let i = 1; i < points.length - 1; i += 1) {
    if (Math.hypot(point.x - points[i].x, point.y - points[i].y) <= removeThreshold) {
      return removeBendPoint(points, i);
    }
  }

  let closestSegment = -1;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    const distance = distanceToOrthogonalSegment(points[i], points[i + 1], point);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestSegment = i;
    }
  }
  if (closestSegment >= 0 && closestDistance <= INSERT_RADIUS_PX / zoom) {
    return insertBendPoint(points, closestSegment);
  }
  return null;
};

import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  ShapeResizeHandle,
} from "@/core/shapes/base/base-shape-definition";
import { isPointNearPolyline } from "@/core/shapes/base/shape-geometry-utils";
import { LineShape } from "@/core/shapes/line/types";

export const containsPointInLine = (
  shape: LineShape,
  point: Point,
  radius = 0,
): boolean => {
  return isPointNearPolyline(point, shape.points, 10 + radius);
};

export const getLineResizeHandles = (
  shape: LineShape,
): ShapeResizeHandle[] => {
  if (shape.points.length < 2) return [];
  const endIndex = shape.points.length - 1;
  return [
    { name: "start", x: shape.points[0].x, y: shape.points[0].y },
    {
      name: "end",
      x: shape.points[endIndex].x,
      y: shape.points[endIndex].y,
    },
  ];
};

export const resizeLine = (
  shape: LineShape,
  handle: string,
  point: Point,
  _originalBounds?: Bounds,
): LineShape => {
  if (shape.points.length < 2) return shape;
  const nextPoints = shape.points.map((pt) => ({ ...pt }));
  if (handle === "start") {
    nextPoints[0] = { x: point.x, y: point.y };
  } else if (handle === "end") {
    nextPoints[nextPoints.length - 1] = { x: point.x, y: point.y };
  } else {
    nextPoints[nextPoints.length - 1] = { x: point.x, y: point.y };
  }
  return { ...shape, points: nextPoints };
};

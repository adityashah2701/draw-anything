import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
import { TriangleShape } from "@/core/shapes/triangle/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";

const MIN_SIZE = 10;

export const containsPointInTriangle = (
  shape: TriangleShape,
  point: Point,
  radius = 0,
): boolean => {
  if (shape.points.length < 2) return false;
  const [start, end] = shape.points;
  const minX = Math.min(start.x, end.x) - radius;
  const maxX = Math.max(start.x, end.x) + radius;
  const minY = Math.min(start.y, end.y) - radius;
  const maxY = Math.max(start.y, end.y) + radius;
  return (
    point.x >= minX &&
    point.x <= maxX &&
    point.y >= minY &&
    point.y <= maxY
  );
};

export const getTriangleResizeHandles = (
  shape: TriangleShape,
  bounds?: Bounds | null,
): ShapeResizeHandle[] => {
  if (!bounds) return [];
  const padding = (shape.strokeWidth || 2) / 2;
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const maxX = bounds.maxX + padding;
  const maxY = bounds.maxY + padding;

  return [
    { name: "nw", x: minX, y: minY },
    { name: "n", x: (minX + maxX) / 2, y: minY },
    { name: "ne", x: maxX, y: minY },
    { name: "e", x: maxX, y: (minY + maxY) / 2 },
    { name: "se", x: maxX, y: maxY },
    { name: "s", x: (minX + maxX) / 2, y: maxY },
    { name: "sw", x: minX, y: maxY },
    { name: "w", x: minX, y: (minY + maxY) / 2 },
  ];
};

export const resizeTriangle = (
  shape: TriangleShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): TriangleShape => {
  if (!originalBounds) return shape;

  const padding = (shape.strokeWidth || 2) / 2;
  const box = resizePaddedBox(originalBounds, padding, handle, point, MIN_SIZE);
  if (!box) return shape;

  return {
    ...shape,
    points: [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.maxY },
    ],
  };
};

import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { RectangleShape } from "@/core/shapes/rectangle/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";

const MIN_SIZE = 10;

export const containsPointInRectangle = (
  shape: RectangleShape,
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

export const getRectangleResizeHandles = (
  shape: RectangleShape,
  bounds?: Bounds | null,
): ShapeResizeHandle[] => {
  const targetBounds = bounds;
  if (!targetBounds) return [];
  const padding = (shape.strokeWidth || 2) / 2;
  const minX = targetBounds.minX - padding;
  const minY = targetBounds.minY - padding;
  const maxX = targetBounds.maxX + padding;
  const maxY = targetBounds.maxY + padding;

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

export const resizeRectangle = (
  shape: RectangleShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): RectangleShape => {
  const bounds = originalBounds;
  if (!bounds) return shape;

  const padding = (shape.strokeWidth || 2) / 2;
  let paddedMinX = bounds.minX - padding;
  let paddedMinY = bounds.minY - padding;
  let paddedMaxX = bounds.maxX + padding;
  let paddedMaxY = bounds.maxY + padding;

  switch (handle) {
    case "nw":
      paddedMinX = point.x;
      paddedMinY = point.y;
      break;
    case "ne":
      paddedMaxX = point.x;
      paddedMinY = point.y;
      break;
    case "se":
      paddedMaxX = point.x;
      paddedMaxY = point.y;
      break;
    case "sw":
      paddedMinX = point.x;
      paddedMaxY = point.y;
      break;
    case "n":
      paddedMinY = point.y;
      break;
    case "s":
      paddedMaxY = point.y;
      break;
    case "e":
      paddedMaxX = point.x;
      break;
    case "w":
      paddedMinX = point.x;
      break;
    default:
      return shape;
  }

  if (paddedMaxX - paddedMinX < MIN_SIZE) paddedMaxX = paddedMinX + MIN_SIZE;
  if (paddedMaxY - paddedMinY < MIN_SIZE) paddedMaxY = paddedMinY + MIN_SIZE;

  const minX = paddedMinX + padding;
  const minY = paddedMinY + padding;
  const maxX = paddedMaxX - padding;
  const maxY = paddedMaxY - padding;

  return {
    ...shape,
    points: [
      { x: minX, y: minY },
      { x: maxX, y: maxY },
    ],
  };
};

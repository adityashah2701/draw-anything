import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { CircleShape } from "@/core/shapes/circle/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { getCircleRadius } from "@/core/shapes/circle/geometry";

const MIN_DIAMETER = 10;

export const containsPointInCircle = (
  shape: CircleShape,
  point: Point,
  radius = 0,
): boolean => {
  if (shape.points.length < 2) return false;
  const center = shape.points[0];
  const circleRadius = getCircleRadius(shape);
  return Math.hypot(point.x - center.x, point.y - center.y) <= circleRadius + radius;
};

export const getCircleResizeHandles = (
  shape: CircleShape,
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

export const resizeCircle = (
  shape: CircleShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): CircleShape => {
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

  if (paddedMaxX - paddedMinX < MIN_DIAMETER) {
    paddedMaxX = paddedMinX + MIN_DIAMETER;
  }
  if (paddedMaxY - paddedMinY < MIN_DIAMETER) {
    paddedMaxY = paddedMinY + MIN_DIAMETER;
  }

  const minX = paddedMinX + padding;
  const minY = paddedMinY + padding;
  const maxX = paddedMaxX - padding;
  const maxY = paddedMaxY - padding;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radius = Math.max(1, Math.min(maxX - minX, maxY - minY) / 2);

  return {
    ...shape,
    points: [
      { x: centerX, y: centerY },
      { x: centerX + radius, y: centerY },
    ],
  };
};

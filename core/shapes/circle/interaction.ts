import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
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
  if (!originalBounds) return shape;

  const padding = (shape.strokeWidth || 2) / 2;
  const box = resizePaddedBox(originalBounds, padding, handle, point, MIN_DIAMETER);
  if (!box) return shape;

  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  const radius = Math.max(1, Math.min(box.maxX - box.minX, box.maxY - box.minY) / 2);

  return {
    ...shape,
    points: [
      { x: centerX, y: centerY },
      { x: centerX + radius, y: centerY },
    ],
  };
};

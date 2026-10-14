import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
import { RectangleShape } from "@/core/shapes/rectangle/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";

const MIN_SIZE = 10;

const isUnfilled = (fill: string | undefined) =>
  !fill || fill === "transparent" || fill === "none";

export const containsPointInRectangle = (
  shape: RectangleShape,
  point: Point,
  radius = 0,
): boolean => {
  if (shape.points.length < 2) return false;
  const [start, end] = shape.points;
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const insideOuter =
    point.x >= minX - radius &&
    point.x <= maxX + radius &&
    point.y >= minY - radius &&
    point.y <= maxY + radius;
  if (!insideOuter) return false;

  // An unfilled guide frame (an AI group box) surrounds other shapes. Hitting
  // its empty interior would let a click or the eraser take the whole group
  // instead of the node inside it, so only its border counts.
  if (shape.isGuide && isUnfilled(shape.fill)) {
    const band = Math.max(radius, (shape.strokeWidth || 1) / 2);
    const insideInner =
      point.x > minX + band &&
      point.x < maxX - band &&
      point.y > minY + band &&
      point.y < maxY - band;
    return !insideInner;
  }
  return true;
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

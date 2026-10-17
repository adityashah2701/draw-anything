import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
import { EllipseShape } from "@/core/shapes/ellipse/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";

const MIN_SIZE = 10;

export const containsPointInEllipse = (
  shape: EllipseShape,
  point: Point,
  radius = 0,
): boolean => {
  if (shape.points.length < 2) return false;
  const [p1, p2] = shape.points;
  const left = Math.min(p1.x, p2.x);
  const right = Math.max(p1.x, p2.x);
  const top = Math.min(p1.y, p2.y);
  const bottom = Math.max(p1.y, p2.y);

  const halfW = Math.max(1, (right - left) / 2 + radius);
  const halfH = Math.max(1, (bottom - top) / 2 + radius);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  const nx = Math.abs((point.x - cx) / halfW);
  const ny = Math.abs((point.y - cy) / halfH);
  return nx * nx + ny * ny <= 1;
};

export const getEllipseResizeHandles = (
  shape: EllipseShape,
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

export const resizeEllipse = (
  shape: EllipseShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): EllipseShape => {
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

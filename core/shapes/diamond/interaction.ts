import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { DiamondShape } from "@/core/shapes/diamond/types";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";

const MIN_SIZE = 10;

export const containsPointInDiamond = (
  shape: DiamondShape,
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
  return nx + ny <= 1;
};

export const getDiamondResizeHandles = (
  shape: DiamondShape,
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

export const resizeDiamond = (
  shape: DiamondShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): DiamondShape => {
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

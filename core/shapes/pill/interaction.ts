import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { getPillBounds } from "@/core/shapes/pill/geometry";
import { PillShape } from "@/core/shapes/pill/types";

const MIN_SIZE = 10;

/** Inside the stadium: within one radius of the segment joining the two end-cap centres. */
export const containsPointInPill = (shape: PillShape, point: Point, radius = 0): boolean => {
  const b = getPillBounds(shape);
  if (!b) return false;
  const r = Math.min(b.width, b.height) / 2;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const half = (b.width >= b.height ? b.width : b.height) / 2 - r;
  const [dx, dy] = b.width >= b.height ? [1, 0] : [0, 1];
  const along = Math.max(-half, Math.min(half, (point.x - cx) * dx + (point.y - cy) * dy));
  return Math.hypot(point.x - (cx + along * dx), point.y - (cy + along * dy)) <= r + radius;
};

export const getPillResizeHandles = (shape: PillShape, bounds?: Bounds | null): ShapeResizeHandle[] => {
  if (!bounds) return [];
  const pad = (shape.strokeWidth || 2) / 2;
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  const maxX = bounds.maxX + pad;
  const maxY = bounds.maxY + pad;
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

export const resizePill = (shape: PillShape, handle: string, point: Point, originalBounds?: Bounds): PillShape => {
  if (!originalBounds) return shape;
  const box = resizePaddedBox(originalBounds, (shape.strokeWidth || 2) / 2, handle, point, MIN_SIZE);
  if (!box) return shape;
  return { ...shape, points: [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY }] };
};

import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { IconShape } from "@/core/shapes/icon/types";

/** Smallest an icon can be resized to, in world units: below this a glyph is a smudge. */
export const MIN_ICON_SIZE = 16;

export const containsPointInIcon = (shape: IconShape, point: Point, radius = 0): boolean => {
  if (shape.points.length < 2) return false;
  const [a, b] = shape.points;
  return (
    point.x >= Math.min(a.x, b.x) - radius &&
    point.x <= Math.max(a.x, b.x) + radius &&
    point.y >= Math.min(a.y, b.y) - radius &&
    point.y <= Math.max(a.y, b.y) + radius
  );
};

export const getIconResizeHandles = (shape: IconShape, bounds?: Bounds | null): ShapeResizeHandle[] => {
  if (!bounds) return [];
  const padding = (shape.strokeWidth || 2) / 2;
  const [minX, minY, maxX, maxY] = [bounds.minX - padding, bounds.minY - padding, bounds.maxX + padding, bounds.maxY + padding];
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

export const resizeIcon = (shape: IconShape, handle: string, point: Point, originalBounds?: Bounds): IconShape => {
  if (!originalBounds) return shape;
  const padding = (shape.strokeWidth || 2) / 2;
  // The minimum applies to the padded box the handles sit on; add the padding back so the icon itself keeps it.
  const box = resizePaddedBox(originalBounds, padding, handle, point, MIN_ICON_SIZE + 2 * padding);
  if (!box) return shape;
  return { ...shape, points: [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY }] };
};

import type { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizePaddedBox } from "@/core/shapes/base/resize-box";
import type { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { distanceToPolygonEdge, flattenPath, pointInPolygon } from "@/core/shapes/outline/path";
import type { OutlineShape } from "@/core/shapes/outline/types";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";
import { getOutlineBounds } from "@/core/shapes/outline/geometry";

const MIN_SIZE = 10;

/** Inside the outline, or within `radius` of its edge (the pick slop). */
export const containsPointInOutline = (shape: OutlineShape, point: Point, radius = 0): boolean => {
  const bounds = getOutlineBounds(shape);
  if (!bounds) return false;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const polygon = flattenPath(resolveOutlineVariant(shape.variant).path(width, height)).map((p) => ({ x: p.x + bounds.minX, y: p.y + bounds.minY }));
  if (pointInPolygon(point, polygon)) return true;
  return radius > 0 && distanceToPolygonEdge(point, polygon) <= radius;
};

export const getOutlineResizeHandles = (shape: OutlineShape, bounds?: Bounds | null): ShapeResizeHandle[] => {
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

export const resizeOutline = (shape: OutlineShape, handle: string, point: Point, originalBounds?: Bounds): OutlineShape => {
  if (!originalBounds) return shape;
  const box = resizePaddedBox(originalBounds, (shape.strokeWidth || 2) / 2, handle, point, MIN_SIZE);
  if (!box) return shape;
  return { ...shape, points: [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY }] };
};

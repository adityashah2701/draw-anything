import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import type { OutlineShape } from "@/core/shapes/outline/types";

export const getOutlineBounds = (shape: OutlineShape): Bounds | null => {
  if (shape.points.length < 2) return null;
  const [start, end] = shape.points;
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

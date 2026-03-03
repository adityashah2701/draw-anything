import { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { FreehandShape } from "@/core/shapes/freehand/types";

export const getFreehandBounds = (shape: FreehandShape): Bounds | null => {
  if (shape.points.length === 0) return null;
  let minX = shape.points[0].x;
  let minY = shape.points[0].y;
  let maxX = shape.points[0].x;
  let maxY = shape.points[0].y;
  shape.points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};


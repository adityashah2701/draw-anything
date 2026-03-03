import { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { DiamondShape } from "@/core/shapes/diamond/types";

export const getDiamondBounds = (shape: DiamondShape): Bounds | null => {
  if (shape.points.length < 2) return null;
  const start = shape.points[0];
  const end = shape.points[1];
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};


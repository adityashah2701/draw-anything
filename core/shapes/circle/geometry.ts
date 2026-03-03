import { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { CircleShape } from "@/core/shapes/circle/types";

export const getCircleRadius = (shape: CircleShape): number => {
  if (shape.points.length < 2) return 0;
  const center = shape.points[0];
  const edge = shape.points[1];
  return Math.hypot(edge.x - center.x, edge.y - center.y);
};

export const getCircleBounds = (shape: CircleShape): Bounds | null => {
  if (shape.points.length < 2) return null;
  const center = shape.points[0];
  const radius = getCircleRadius(shape);
  return {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius,
    width: radius * 2,
    height: radius * 2,
  };
};


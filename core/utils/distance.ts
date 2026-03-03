import { Point } from "@/features/whiteboard/types/whiteboard.types";

export const squaredDistance = (a: Point, b: Point): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const distance = (a: Point, b: Point): number =>
  Math.sqrt(squaredDistance(a, b));


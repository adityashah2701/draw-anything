import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

export const movable = <T extends DrawingElement>(): ShapeCapability<T> => ({
  id: "movable",
  onMove: (shape, delta) => ({
    ...shape,
    points: shape.points.map((point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    })),
  }),
});


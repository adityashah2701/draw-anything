import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

export const rotatable = <T extends DrawingElement>(): ShapeCapability<T> => ({
  id: "rotatable",
});


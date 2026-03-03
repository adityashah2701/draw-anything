import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

export const resizable = <T extends DrawingElement>(): ShapeCapability<T> => ({
  id: "resizable",
});


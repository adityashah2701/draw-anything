import { DrawingElement } from "@/core/model";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

export const labelable = <T extends DrawingElement>(): ShapeCapability<T> => ({
  id: "labelable",
  validate: (shape) =>
    typeof shape.label !== "string" || shape.label.trim().length <= 120,
});


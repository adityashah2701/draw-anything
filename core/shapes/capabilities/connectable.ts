import {
  Anchor,
  Bounds,
  DrawingElement,
} from "@/core/model";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

export type AnchorResolver<T extends DrawingElement> = (
  shape: T,
  bounds: Bounds | null,
) => Anchor[];

export const connectable = <T extends DrawingElement>(
  _resolver: AnchorResolver<T>,
): ShapeCapability<T> => ({
  id: "connectable",
});


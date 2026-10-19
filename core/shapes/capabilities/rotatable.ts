import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ShapeCapability } from "@/core/shapes/base/shape-capability";

/**
 * The shape honours `rotation` (degrees, clockwise, about the centre of its unrotated box). Its
 * `points` stay the unrotated box; rotation is applied where geometry is read (bounds, hit-testing,
 * anchors, handles) and drawn (`shape-runtime.ts`), so no shape implements it itself.
 */
export const rotatable = <T extends DrawingElement>(): ShapeCapability<T> => ({
  id: "rotatable",
});

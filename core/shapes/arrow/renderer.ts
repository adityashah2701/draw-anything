import { drawArrow, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { ArrowShape } from "@/core/shapes/arrow/types";

export const renderArrowToCanvas = (
  shape: ArrowShape,
  context: ShapeRenderCanvasContext,
) => {
  if (!isArrowElement(shape)) return;
  drawArrow(context.ctx, shape, context.zoom, context.panOffset);
};

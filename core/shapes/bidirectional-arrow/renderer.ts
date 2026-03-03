import { drawArrow, isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { BidirectionalArrowShape } from "@/core/shapes/bidirectional-arrow/types";

export const renderBidirectionalArrowToCanvas = (
  shape: BidirectionalArrowShape,
  context: ShapeRenderCanvasContext,
) => {
  if (!isArrowElement(shape)) return;
  drawArrow(context.ctx, shape, context.zoom, context.panOffset);
};

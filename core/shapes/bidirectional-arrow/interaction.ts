import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { BidirectionalArrowShape } from "@/core/shapes/bidirectional-arrow/types";
import { resizeArrowElement } from "@/core/shapes/arrow/interaction";

export const resizeBidirectionalArrow = (
  shape: BidirectionalArrowShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): BidirectionalArrowShape =>
  resizeArrowElement(shape, handle, point, originalBounds);

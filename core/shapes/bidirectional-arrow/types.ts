import { DrawingElement } from "@/core/model";

export type BidirectionalArrowShape = Extract<
  DrawingElement,
  { type: "arrow-bidirectional" }
>;


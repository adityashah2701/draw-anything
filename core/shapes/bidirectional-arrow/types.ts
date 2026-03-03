import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type BidirectionalArrowShape = Extract<
  DrawingElement,
  { type: "arrow-bidirectional" }
>;


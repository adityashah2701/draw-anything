import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type DiamondShape = Extract<DrawingElement, { type: "diamond" }>;


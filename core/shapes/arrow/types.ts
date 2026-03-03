import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type ArrowShape = Extract<DrawingElement, { type: "arrow" }>;


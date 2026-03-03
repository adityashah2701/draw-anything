import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type TextShape = Extract<DrawingElement, { type: "text" }>;


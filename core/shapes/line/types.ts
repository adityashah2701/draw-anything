import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type LineShape = Extract<DrawingElement, { type: "line" }>;


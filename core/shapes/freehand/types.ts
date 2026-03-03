import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type FreehandShape = Extract<DrawingElement, { type: "freehand" }>;


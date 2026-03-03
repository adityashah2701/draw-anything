import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type RectangleShape = Extract<DrawingElement, { type: "rectangle" }>;


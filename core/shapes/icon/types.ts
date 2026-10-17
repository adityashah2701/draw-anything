import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type IconShape = Extract<DrawingElement, { type: "icon" }>;


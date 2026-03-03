import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type CircleShape = Extract<DrawingElement, { type: "circle" }>;


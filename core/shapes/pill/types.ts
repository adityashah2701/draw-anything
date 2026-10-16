import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type PillShape = Extract<DrawingElement, { type: "pill" }>;

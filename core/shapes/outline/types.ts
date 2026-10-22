import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type OutlineShape = Extract<DrawingElement, { type: "outline" }>;

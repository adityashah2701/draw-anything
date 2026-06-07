import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type TriangleShape = Extract<DrawingElement, { type: "triangle" }>;

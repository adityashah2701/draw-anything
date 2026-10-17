import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type EllipseShape = Extract<DrawingElement, { type: "ellipse" }>;


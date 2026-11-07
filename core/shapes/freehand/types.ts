import { DrawingElement } from "@/core/model";

export type FreehandShape = Extract<DrawingElement, { type: "freehand" }>;


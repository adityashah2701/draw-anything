import { DrawingElement } from "@/core/model";

export type TextShape = Extract<DrawingElement, { type: "text" }>;


import { DrawingElement } from "@/core/model";

export type LineShape = Extract<DrawingElement, { type: "line" }>;


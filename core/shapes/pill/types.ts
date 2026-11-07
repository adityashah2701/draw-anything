import { DrawingElement } from "@/core/model";

export type PillShape = Extract<DrawingElement, { type: "pill" }>;

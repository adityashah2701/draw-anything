import { DrawingElement } from "@/core/model";

export type OutlineShape = Extract<DrawingElement, { type: "outline" }>;

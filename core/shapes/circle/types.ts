import { DrawingElement } from "@/core/model";

export type CircleShape = Extract<DrawingElement, { type: "circle" }>;


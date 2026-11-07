import { DrawingElement } from "@/core/model";

export type TriangleShape = Extract<DrawingElement, { type: "triangle" }>;

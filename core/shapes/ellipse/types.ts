import { DrawingElement } from "@/core/model";

export type EllipseShape = Extract<DrawingElement, { type: "ellipse" }>;


import { DrawingElement } from "@/core/model";

export type RectangleShape = Extract<DrawingElement, { type: "rectangle" }>;


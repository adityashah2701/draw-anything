import { DrawingElement } from "@/core/model";

export type SemanticNodeShape = Extract<DrawingElement, { type: "semantic-node" }>;

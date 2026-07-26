import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export type SemanticNodeShape = Extract<DrawingElement, { type: "semantic-node" }>;

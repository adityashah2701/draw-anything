import { AIGenerateDiagramRequest } from "@/features/ai/types";

export const DIAGRAM_TYPES = [
  "architecture",
  "flowchart",
  "concept",
  "mind-map",
  "sequence",
  "network",
  "entity-relationship",
  "workflow",
  "class",
  "organization",
  "dependency",
].join(", ");

export const NODE_KINDS = [
  "service",
  "database",
  "api",
  "cache",
  "queue",
  "gateway",
  "auth",
  "cdn",
  "load-balancer",
  "worker",
  "storage",
  "monitoring",
  "user",
  "browser",
  "external",
  "generic",
].join(", ");

export const contextSummary = (request: AIGenerateDiagramRequest) => {
  const elements = request.canvasContext?.elements ?? [];
  const selected = request.canvasContext?.selectedElementIds ?? [];
  return [
    `Existing canvas elements: ${elements.length}`,
    `Selected elements: ${selected.length}`,
    request.whiteboardId ? `Whiteboard id: ${request.whiteboardId}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

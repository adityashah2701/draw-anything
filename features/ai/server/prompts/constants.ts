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
  "authentication",
  "cdn",
  "load-balancer",
  "worker",
  "storage",
  "dashboard",
  "alerting",
  "user",
  "browser",
  "external",
  "generic",
].join(", ");

/** Icon ids a model may put in a node's optional `icon`; unknown ids are ignored, not errors. */
export const ICON_HINT =
  "Optional \"icon\": a technology name when the kind is too coarse (e.g. postgres, kafka, nginx, s3, redis, esp32, sensor, bluetooth, can-bus). Omit it when the kind already says it.";

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

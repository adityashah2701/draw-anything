import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  AIDiagramDocumentV1,
  AIDiagramType,
  AIGenerateDiagramRequest,
} from "@/features/ai/types";

const DIAGRAM_TYPES = [
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

const NODE_KINDS = [
  "service",
  "database",
  "server",
  "api",
  "queue",
  "cache",
  "storage",
  "cdn",
  "dns",
  "firewall",
  "waf",
  "load-balancer",
  "internet",
  "kubernetes",
  "pod",
  "cluster",
  "container",
  "worker",
  "service-mesh",
  "deployment",
  "namespace",
  "region",
  "availability-zone",
  "vm",
  "user",
  "mobile",
  "browser",
  "lambda",
  "event-bus",
  "secrets",
  "authentication",
  "gateway",
  "message-broker",
  "ai-model",
  "agent",
  "tool",
  "memory",
  "knowledge-base",
  "vector-store",
  "dashboard",
  "alerting",
  "config",
  "cicd",
  "workflow",
  "decision",
  "parallel",
  "retry",
  "loop",
  "external",
  "generic",
].join(", ");

const contextSummary = (request: AIGenerateDiagramRequest) => {
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

export const buildPlannerMessages = async (request: AIGenerateDiagramRequest) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are a senior diagram architect.",
        "Classify the user request and choose a visual strategy before creating shapes.",
        `Supported diagram types: ${DIAGRAM_TYPES}.`,
        "Prefer layered or hierarchical layouts for engineering diagrams.",
        "Return only structured data matching the requested schema.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Canvas context:",
        "{canvasContext}",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    canvasContext: contextSummary(request),
  });

export const buildArchitecturePlannerMessages = buildPlannerMessages;

export const buildDomainModelMessages = async (
  request: AIGenerateDiagramRequest,
  plan: unknown,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are the domain modeling agent for an architecture whiteboard.",
        "Create a semantic graph of actors, systems, data stores, interfaces, and important decisions.",
        "Do not emit coordinates.",
        `Allowed semantic node kinds: ${NODE_KINDS}.`,
        "Prefer concise, presentation-ready labels.",
        "Edges must reference existing node ids only.",
        "Return only nodes, edges, and groups.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Architecture plan:",
        "{plan}",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    plan: JSON.stringify(plan),
  });

export const buildGraphDraftMessages = async (
  request: AIGenerateDiagramRequest,
  plan: {
    diagramType: AIDiagramType;
    summary: string;
    layoutStrategy: string;
    direction: string;
  },
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are an expert whiteboard diagram designer.",
        "Create a semantic graph first. Do not emit coordinates.",
        `Allowed semantic node kinds: ${NODE_KINDS}.`,
        "Use concise node labels, usually 1-4 words.",
        "Keep diagrams readable: 6-18 nodes is ideal unless the user explicitly asks for more.",
        "Use stable lowercase ids with hyphens.",
        "Edges must reference existing node ids only.",
        "Use groups only when they materially improve the diagram.",
        "For architecture diagrams, assign layers in edge, application, data, observability, or external.",
        "Return only structured data matching the requested schema.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Plan:",
        "{plan}",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    plan: JSON.stringify(plan),
  });

export const buildRelationshipMessages = async (
  request: AIGenerateDiagramRequest,
  graph: unknown,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are the relationship agent for a professional diagramming tool.",
        "Review the graph and repair missing or invalid relationships.",
        "Keep edges sparse and meaningful. Avoid dense all-to-all graphs.",
        "Return the full graph with nodes, edges, and groups.",
      ].join("\n"),
    ],
    [
      "human",
      ["User request:", "{prompt}", "", "Current graph:", "{graph}"].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    graph: JSON.stringify(graph),
  });

export const buildCriticMessages = async (
  request: AIGenerateDiagramRequest,
  document: AIDiagramDocumentV1,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are a pragmatic senior architecture reviewer.",
        "Critique the graph for missing production concerns, unclear ownership, invalid relationships, and confusing labels.",
        "Return only a repaired full graph if changes are necessary.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Current document:",
        "{document}",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    document: JSON.stringify({
      nodes: document.nodes,
      edges: document.edges,
      groups: document.groups,
      validation: document.validation,
      risks: document.reasoningMetadata.risks,
    }),
  });

export const buildImprovementMessages = async (
  request: AIGenerateDiagramRequest,
  document: AIDiagramDocumentV1,
) =>
  ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "You are the improvement agent.",
        "If presenting this to a senior engineer, improve clarity, hierarchy, labels, and relationships.",
        "Do not add visual coordinates.",
        "Keep edge references valid and preserve the user's intent.",
        "Return the full graph with nodes, edges, and groups.",
      ].join("\n"),
    ],
    [
      "human",
      [
        "User request:",
        "{prompt}",
        "",
        "Validation report:",
        "{validation}",
        "",
        "Current graph:",
        "{graph}",
      ].join("\n"),
    ],
  ]).formatMessages({
    prompt: request.prompt,
    validation: JSON.stringify(document.validation),
    graph: JSON.stringify({
      nodes: document.nodes,
      edges: document.edges,
      groups: document.groups,
    }),
  });

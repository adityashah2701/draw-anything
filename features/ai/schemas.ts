import { z } from "zod";
import {
  AIDiagramDocumentV1,
  AIDiagramEdge,
  AIDiagramNode,
  AISemanticNodeKind,
} from "@/features/ai/types";

export const aiSemanticNodeKindSchema = z.enum([
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
]) satisfies z.ZodType<AISemanticNodeKind>;

const semanticNodeKindValues = new Set<string>(aiSemanticNodeKindSchema.options);

const normalizeSemanticKind = (kind: unknown): AISemanticNodeKind => {
  if (typeof kind === "string" && semanticNodeKindValues.has(kind)) {
    return kind as AISemanticNodeKind;
  }
  return "generic";
};

export const aiDiagramTypeSchema = z.enum([
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
]);

const diagramTypeValues = new Set<string>(aiDiagramTypeSchema.options);

const normalizeDiagramType = (diagramType: unknown) => {
  if (typeof diagramType === "string" && diagramTypeValues.has(diagramType)) {
    return diagramType;
  }
  return "architecture";
};

export const aiDiagramNodeSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  kind: aiSemanticNodeKindSchema.default("generic"),
  layer: z
    .enum(["edge", "application", "data", "observability", "external"])
    .optional(),
  column: z.number().int().min(0).max(24).optional(),
  parentId: z.string().min(1).max(80).optional(),
  description: z.string().max(240).optional(),
  priority: z.number().min(0).max(10).optional(),
}) satisfies z.ZodType<AIDiagramNode>;

export const aiDiagramEdgeSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  label: z.string().max(80).optional(),
  relationship: z.string().max(120).optional(),
  bidirectional: z.boolean().optional(),
  dashed: z.boolean().optional(),
}) satisfies z.ZodType<AIDiagramEdge>;

const optionalStringArraySchema = z.array(z.string().min(1).max(120)).default([]);

export const aiRequirementSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(240),
  priority: z.enum(["must", "should", "could"]).default("should"),
  source: z.enum(["prompt", "canvas", "memory", "inferred"]).default("prompt"),
});

export const aiArchitectureComponentSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  responsibility: z.string().min(1).max(240),
  kind: aiSemanticNodeKindSchema.default("generic"),
  criticality: z.enum(["low", "medium", "high"]).optional(),
});

export const aiContainerSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  nodeIds: z.array(z.string().min(1).max(80)).default([]),
  kind: z.enum(["system", "boundary", "deployment", "data", "team"]).default("system"),
});

export const aiAnnotationSchema = z.object({
  id: z.string().min(1).max(80),
  targetId: z.string().min(1).max(80).optional(),
  text: z.string().min(1).max(240),
  severity: z.enum(["info", "warning", "risk"]).optional(),
});

export const aiTrustBoundarySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  nodeIds: z.array(z.string().min(1).max(80)).default([]),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
});

export const aiCommunicationProtocolSchema = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  protocol: z.string().min(1).max(80),
  pattern: z.enum(["sync", "async", "streaming", "batch"]).optional(),
});

export const aiVisualImportanceSchema = z.object({
  nodeId: z.string().min(1).max(80),
  score: z.number().min(0).max(10),
  reason: z.string().max(160).optional(),
});

export const aiDiagramGroupSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  nodeIds: z.array(z.string().min(1).max(80)).default([]),
  kind: z.string().max(80).optional(),
});

export const aiPlanSchema = z.object({
  diagramType: aiDiagramTypeSchema,
  summary: z.string().min(1).max(300),
  requirements: z.array(aiRequirementSchema).max(12).default([]),
  actors: optionalStringArraySchema,
  systems: optionalStringArraySchema,
  nonFunctionalRequirements: optionalStringArraySchema,
  risks: optionalStringArraySchema,
  layoutStrategy: z
    .enum(["layered", "hierarchical", "radial", "tree", "grid", "dag", "swimlane"])
    .default("layered"),
  direction: z
    .enum(["left-to-right", "top-to-bottom", "radial"])
    .default("top-to-bottom"),
  styleTheme: z.enum(["default", "technical", "product", "minimal"]).default("technical"),
  density: z.enum(["compact", "balanced", "spacious"]).default("balanced"),
});

export const modelPlanSchema = z.object({
  diagramType: z.string(),
  summary: z.string().max(300),
  requirements: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().max(200),
        priority: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .max(12)
    .optional(),
  actors: z.array(z.string().max(60)).max(8).optional(),
  systems: z.array(z.string().max(60)).max(8).optional(),
  nonFunctionalRequirements: z.array(z.string().max(100)).max(6).optional(),
  risks: z.array(z.string().max(100)).max(6).optional(),
  layoutStrategy: z.string().optional(),
  direction: z.string().optional(),
  styleTheme: z.string().optional(),
  density: z.string().optional(),
});

export const normalizeModelPlan = (value: unknown): AIPlanOutput => {
  const plan = modelPlanSchema.parse(value);
  return aiPlanSchema.parse({
    diagramType: normalizeDiagramType(plan.diagramType),
    summary: plan.summary,
    requirements: plan.requirements?.map((requirement, index) => ({
      id: requirement.id || `requirement-${index + 1}`,
      text: requirement.text,
      priority:
        requirement.priority === "must" ||
        requirement.priority === "should" ||
        requirement.priority === "could"
          ? requirement.priority
          : "should",
      source:
        requirement.source === "prompt" ||
        requirement.source === "canvas" ||
        requirement.source === "memory" ||
        requirement.source === "inferred"
          ? requirement.source
          : "prompt",
    })),
    actors: plan.actors ?? [],
    systems: plan.systems ?? [],
    nonFunctionalRequirements: plan.nonFunctionalRequirements ?? [],
    risks: plan.risks ?? [],
    layoutStrategy: [
      "layered",
      "hierarchical",
      "radial",
      "tree",
      "grid",
      "dag",
      "swimlane",
    ].includes(plan.layoutStrategy ?? "")
      ? plan.layoutStrategy
      : "layered",
    direction: ["left-to-right", "top-to-bottom", "radial"].includes(
      plan.direction ?? "",
    )
      ? plan.direction
      : "top-to-bottom",
    styleTheme: ["default", "technical", "product", "minimal"].includes(
      plan.styleTheme ?? "",
    )
      ? plan.styleTheme
      : "technical",
    density: ["compact", "balanced", "spacious"].includes(plan.density ?? "")
      ? plan.density
      : "balanced",
  });
};

export const aiGraphDraftSchema = z.object({
  nodes: z.array(aiDiagramNodeSchema).min(1).max(25),
  edges: z.array(aiDiagramEdgeSchema).max(50).default([]),
  groups: z.array(aiDiagramGroupSchema).max(10).default([]),
});

const modelDiagramEdgeSchema = z
  .object({
    id: z.string().optional(),
    from: z.string(),
    to: z.string(),
    label: z.string().max(60).optional(),
    relationship: z.string().max(80).optional(),
  })
  .passthrough();

const modelDiagramNodeSchema = z
  .object({
    id: z.string(),
    label: z.string().max(60),
    kind: z.string().optional(),
    layer: z.string().optional(),
    column: z.number().optional(),
    parentId: z.string().optional(),
    description: z.string().max(160).optional(),
    priority: z.number().optional(),
  })
  .passthrough();

export const modelGraphDraftSchema = z.object({
  nodes: z.array(modelDiagramNodeSchema).max(25),
  edges: z.array(modelDiagramEdgeSchema).max(50).optional(),
  groups: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().max(60),
        nodeIds: z.array(z.string()).optional(),
        kind: z.string().optional(),
      }),
    )
    .max(10)
    .optional(),
});

export const normalizeModelGraphDraft = (value: unknown): AIGraphDraftOutput => {
  const draft = modelGraphDraftSchema.parse(value);
  return aiGraphDraftSchema.parse({
    nodes: draft.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: normalizeSemanticKind(node.kind),
      layer: ["edge", "application", "data", "observability", "external"].includes(
        node.layer ?? "",
      )
        ? node.layer
        : undefined,
      column: Number.isFinite(node.column) ? Math.floor(node.column ?? 0) : undefined,
      parentId: node.parentId,
      description: node.description,
      priority: Number.isFinite(node.priority)
        ? Math.min(10, Math.max(0, node.priority ?? 0))
        : undefined,
    })),
    edges: (draft.edges ?? []).map((edge, index) => {
      const looseEdge = edge as typeof edge & {
        bidirectional?: unknown;
        dashed?: unknown;
      };
      return {
        id: edge.id ?? `edge-${index + 1}`,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        relationship: edge.relationship,
        bidirectional:
          typeof looseEdge.bidirectional === "boolean"
            ? looseEdge.bidirectional
            : undefined,
        dashed: typeof looseEdge.dashed === "boolean" ? looseEdge.dashed : undefined,
      };
    }),
    groups: (draft.groups ?? []).map((group) => ({
      ...group,
      nodeIds: group.nodeIds ?? [],
    })),
  });
};

const validationIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  targetId: z.string().optional(),
});

const validationReportSchema = z.object({
  valid: z.boolean(),
  repaired: z.boolean(),
  issues: z.array(validationIssueSchema),
  metrics: z.object({
    nodeCount: z.number(),
    edgeCount: z.number(),
    groupCount: z.number(),
    disconnectedComponents: z.number(),
    duplicateIds: z.number(),
    invalidEdges: z.number(),
    overlapCount: z.number(),
    orphanNodes: z.number(),
    oversizedRows: z.number(),
    poorSpacing: z.number(),
  }),
});

export const aiDiagramDocumentV1Schema = z.object({
  schemaVersion: z.literal("ai-diagram-v1"),
  diagramType: aiDiagramTypeSchema,
  intent: z.object({
    prompt: z.string(),
    summary: z.string(),
    audience: z.string().optional(),
  }),
  nodes: z.array(aiDiagramNodeSchema),
  edges: z.array(aiDiagramEdgeSchema),
  groups: z.array(aiDiagramGroupSchema),
  requirements: z.array(aiRequirementSchema),
  architecture: z.array(aiArchitectureComponentSchema),
  containers: z.array(aiContainerSchema),
  annotations: z.array(aiAnnotationSchema),
  trustBoundaries: z.array(aiTrustBoundarySchema),
  communicationProtocols: z.array(aiCommunicationProtocolSchema),
  visualImportance: z.array(aiVisualImportanceSchema),
  layoutHints: z.object({
    strategy: z.enum([
      "layered",
      "hierarchical",
      "radial",
      "tree",
      "grid",
      "dag",
      "swimlane",
    ]),
    direction: z.enum(["left-to-right", "top-to-bottom", "radial"]),
  }),
  styleHints: z.object({
    theme: z.enum(["default", "technical", "product", "minimal"]),
    density: z.enum(["compact", "balanced", "spacious"]),
  }),
  validation: validationReportSchema,
  metadata: z.object({
    generationId: z.string(),
    createdAt: z.string(),
    provider: z.enum(["gemini", "groq", "openai", "anthropic", "openrouter", "local"]),
    model: z.string(),
    improvementPasses: z.number(),
  }),
  reasoningMetadata: z.object({
    requirementsSummary: z.string(),
    architectureSummary: z.string(),
    risks: z.array(z.string()),
    criticNotes: z.array(z.string()),
    toolResults: z.array(
      z.object({
        toolName: z.string(),
        summary: z.string(),
      }),
    ),
  }),
}) satisfies z.ZodType<AIDiagramDocumentV1>;

export type AIPlanOutput = z.infer<typeof aiPlanSchema>;
export type AIGraphDraftOutput = z.infer<typeof aiGraphDraftSchema>;

export const aiMissingComponentSchema = z.object({
  label: z.string().min(1).max(80),
  kind: aiSemanticNodeKindSchema,
  layer: z.enum(["edge", "application", "data", "observability", "external"]),
  reason: z.string().min(1).max(240),
});

export const aiCompletenessReportSchema = z.object({
  isComplete: z.boolean(),
  completenessScore: z.number().min(0).max(10),
  missingComponents: z.array(aiMissingComponentSchema),
  layerCoverage: z.object({
    edge: z.boolean(),
    application: z.boolean(),
    data: z.boolean(),
    observability: z.boolean(),
    external: z.boolean(),
  }),
  notes: z.array(z.string()),
});

export type AICompletenessReport = z.infer<typeof aiCompletenessReportSchema>;

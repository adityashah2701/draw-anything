import { normalizeColor } from "@/core/color/named-colors";
import { z } from "zod";
import { resolveIconId } from "@/core/icons/registry";
import {
  AIDiagramDocumentV1,
  AIDiagramEdge,
  AIDiagramNode,
  AIDiagramType,
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

// Words models commonly use for kinds the schema spells differently.
const KIND_ALIASES: Record<string, AISemanticNodeKind> = {
  auth: "authentication",
  authn: "authentication",
  authz: "authentication",
  identity: "authentication",
  monitoring: "dashboard",
  observability: "dashboard",
  metrics: "dashboard",
  logging: "dashboard",
  db: "database",
  sql: "database",
  datastore: "database",
  "data-store": "database",
  redis: "cache",
  lb: "load-balancer",
  loadbalancer: "load-balancer",
  k8s: "kubernetes",
  "message-queue": "queue",
  mq: "queue",
  broker: "message-broker",
  "object-storage": "storage",
  bucket: "storage",
  function: "lambda",
  serverless: "lambda",
};

export const normalizeSemanticKind = (kind: unknown): AISemanticNodeKind => {
  if (typeof kind !== "string") return "generic";
  const key = kind.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (semanticNodeKindValues.has(key)) return key as AISemanticNodeKind;
  if (KIND_ALIASES[key]) return KIND_ALIASES[key];
  // A vendor word ("kafka", "postgres") the registry knows names a kind or an alias of one.
  const icon = resolveIconId(key);
  return icon && semanticNodeKindValues.has(icon) ? (icon as AISemanticNodeKind) : "generic";
};

/** An icon reference worth storing: valid, and different from what the node's kind already shows. */
export const normalizeIconReference = (candidates: unknown[], kind: AISemanticNodeKind): string | undefined => {
  const id = candidates.map(resolveIconId).find((resolved) => resolved !== undefined);
  return id && id !== resolveIconId(kind) ? id : undefined;
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

const DIAGRAM_TYPE_ALIASES: Record<string, AIDiagramType> = {
  erd: "entity-relationship",
  mindmap: "mind-map",
  "flow-chart": "flowchart",
  "org-chart": "organization",
  "uml-class": "class",
  "class-diagram": "class",
  "system-architecture": "architecture",
};

/** The diagram type a free-form string names, or null if it names none. */
export const parseDiagramType = (diagramType: unknown): AIDiagramType | null => {
  if (typeof diagramType !== "string") return null;
  const key = diagramType
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-diagram$/, "");
  if (diagramTypeValues.has(key)) return key as AIDiagramType;
  return DIAGRAM_TYPE_ALIASES[key] ?? null;
};

const normalizeDiagramType = (diagramType: unknown): AIDiagramType =>
  parseDiagramType(diagramType) ?? "architecture";

export const aiDiagramNodeSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  kind: aiSemanticNodeKindSchema.default("generic"),
  icon: z.string().max(40).optional(),
  layer: z
    .enum(["edge", "application", "data", "observability", "external"])
    .optional(),
  column: z.number().int().min(0).max(24).optional(),
  parentId: z.string().min(1).max(80).optional(),
  description: z.string().max(240).optional(),
  priority: z.number().min(0).max(10).optional(),
  shape: z.literal("diamond").optional(),
  color: z.string().max(7).optional(),
}) satisfies z.ZodType<AIDiagramNode>;

export const aiDiagramEdgeSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  label: z.string().max(80).optional(),
  relationship: z.string().max(120).optional(),
  bidirectional: z.boolean().optional(),
  dashed: z.boolean().optional(),
  plain: z.boolean().optional(),
  color: z.string().max(7).optional(),
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

// ── Tolerant coercion helpers: models routinely send nulls, wrong types and
// over-long strings. These shorten or drop; they never throw. ──

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const stringList = (value: unknown, maxItems: number, maxLength: number): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => text(item, maxLength))
        .filter((item): item is string => item !== undefined)
        .slice(0, maxItems)
    : [];

const slug = (value: string, fallback: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

export const normalizeModelPlan = (value: unknown): AIPlanOutput => {
  const plan = isRecord(value) ? value : {};
  const requirements = (Array.isArray(plan.requirements) ? plan.requirements : [])
    .filter(isRecord)
    .map((requirement, index) => ({
      id: text(requirement.id, 80) ?? `requirement-${index + 1}`,
      text: text(requirement.text, 240),
      priority: pick(requirement.priority, ["must", "should", "could"] as const, "should"),
      source: pick(
        requirement.source,
        ["prompt", "canvas", "memory", "inferred"] as const,
        "prompt",
      ),
    }))
    .filter(
      (requirement): requirement is typeof requirement & { text: string } =>
        requirement.text !== undefined,
    )
    .slice(0, 12);

  return aiPlanSchema.parse({
    diagramType: normalizeDiagramType(plan.diagramType),
    summary: text(plan.summary, 300) ?? "Generated diagram",
    requirements,
    actors: stringList(plan.actors, 8, 60),
    systems: stringList(plan.systems, 8, 60),
    nonFunctionalRequirements: stringList(plan.nonFunctionalRequirements, 6, 100),
    risks: stringList(plan.risks, 6, 100),
    layoutStrategy: pick(
      plan.layoutStrategy,
      ["layered", "hierarchical", "radial", "tree", "grid", "dag", "swimlane"] as const,
      "layered",
    ),
    direction: pick(
      plan.direction,
      ["left-to-right", "top-to-bottom", "radial"] as const,
      "top-to-bottom",
    ),
    styleTheme: pick(
      plan.styleTheme,
      ["default", "technical", "product", "minimal"] as const,
      "technical",
    ),
    density: pick(plan.density, ["compact", "balanced", "spacious"] as const, "balanced"),
  });
};

/** Hard caps on a generated graph; anything beyond is dropped with a warning. */
export const MAX_GRAPH_NODES = 40;
export const MAX_GRAPH_EDGES = 80;
export const MAX_GRAPH_GROUPS = 12;

export const aiGraphDraftSchema = z.object({
  nodes: z.array(aiDiagramNodeSchema).min(1).max(MAX_GRAPH_NODES),
  edges: z.array(aiDiagramEdgeSchema).max(MAX_GRAPH_EDGES).default([]),
  groups: z.array(aiDiagramGroupSchema).max(MAX_GRAPH_GROUPS).default([]),
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
    icon: z.string().optional(),
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

const ARROW = /^\s*(.+?)\s*(?:-+>|=+>|→|->)\s*(.+?)\s*$/;

const toEdgeEndpoints = (raw: unknown): { from: string; to: string; source: Record<string, unknown> } | null => {
  if (typeof raw === "string") {
    const match = ARROW.exec(raw);
    return match ? { from: match[1], to: match[2], source: {} } : null;
  }
  if (!isRecord(raw)) return null;
  const from = text(raw.from ?? raw.source ?? raw.start ?? raw.src, 80);
  const to = text(raw.to ?? raw.target ?? raw.end ?? raw.dst, 80);
  return from && to ? { from, to, source: raw } : null;
};

export interface NormalizedGraphDraft {
  graph: AIGraphDraftOutput;
  /** Things that were clamped, dropped or defaulted; surface them as issues. */
  warnings: string[];
}

/**
 * Turn whatever the model returned into a valid graph. Sizes are clamped,
 * nulls and wrong types are ignored, common alternative shapes are accepted
 * (string nodes, `source`/`target`, `"A -> B"`), and only output with no
 * usable nodes at all is an error.
 */
export const normalizeModelGraphDraftDetailed = (value: unknown): NormalizedGraphDraft => {
  const raw = isRecord(value) ? value : {};
  const warnings: string[] = [];

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes: AIDiagramNode[] = [];
  let unusableNodes = 0;
  let shortened = 0;
  rawNodes.forEach((rawNode, index) => {
    const record = typeof rawNode === "string" ? { label: rawNode } : rawNode;
    if (!isRecord(record)) {
      unusableNodes += 1;
      return;
    }
    const fullLabel = text(record.label ?? record.name ?? record.title, 10_000);
    if (!fullLabel) {
      unusableNodes += 1;
      return;
    }
    if (fullLabel.length > 80) shortened += 1;
    const label = fullLabel.slice(0, 80);
    const column = typeof record.column === "number" && Number.isFinite(record.column)
      ? Math.min(24, Math.max(0, Math.floor(record.column)))
      : undefined;
    const priority = typeof record.priority === "number" && Number.isFinite(record.priority)
      ? Math.min(10, Math.max(0, record.priority))
      : undefined;
    const kind = normalizeSemanticKind(record.kind ?? record.type);
    nodes.push({
      id: text(record.id, 80) ?? slug(label, `node-${index + 1}`),
      label,
      kind,
      icon: normalizeIconReference([record.icon, record.kind, record.type], kind),
      layer: pick(
        record.layer,
        ["edge", "application", "data", "observability", "external"] as const,
        undefined as unknown as "edge",
      ),
      column,
      parentId: text(record.parentId, 80),
      description: text(record.description, 240),
      priority,
      shape: record.shape === "diamond" ? "diamond" : undefined,
      color: normalizeColor(record.color),
    });
  });

  if (nodes.length === 0) {
    throw new Error(
      "The model returned no usable nodes. Expected an object with a non-empty `nodes` array of { id, label, kind }.",
    );
  }
  if (unusableNodes > 0) warnings.push(`Ignored ${unusableNodes} unusable node(s).`);
  if (shortened > 0) warnings.push(`Shortened ${shortened} long label(s).`);
  if (nodes.length > MAX_GRAPH_NODES) {
    warnings.push(`Dropped ${nodes.length - MAX_GRAPH_NODES} node(s) beyond the limit of ${MAX_GRAPH_NODES}.`);
    nodes.length = MAX_GRAPH_NODES;
  }

  const rawEdges = Array.isArray(raw.edges)
    ? raw.edges
    : Array.isArray(raw.connections)
      ? raw.connections
      : Array.isArray(raw.links)
        ? raw.links
        : [];
  const edges: AIDiagramEdge[] = [];
  let unusableEdges = 0;
  rawEdges.forEach((rawEdge, index) => {
    const endpoints = toEdgeEndpoints(rawEdge);
    if (!endpoints) {
      unusableEdges += 1;
      return;
    }
    const { source } = endpoints;
    edges.push({
      id: text(source.id, 100) ?? `edge-${index + 1}`,
      from: endpoints.from,
      to: endpoints.to,
      label: text(source.label, 80),
      relationship: text(source.relationship, 120),
      bidirectional: typeof source.bidirectional === "boolean" ? source.bidirectional : undefined,
      dashed: typeof source.dashed === "boolean" ? source.dashed : undefined,
      plain: typeof source.plain === "boolean" ? source.plain : undefined,
      color: normalizeColor(source.color),
    });
  });
  if (unusableEdges > 0) warnings.push(`Ignored ${unusableEdges} unusable edge(s).`);
  if (edges.length > MAX_GRAPH_EDGES) {
    warnings.push(`Dropped ${edges.length - MAX_GRAPH_EDGES} edge(s) beyond the limit of ${MAX_GRAPH_EDGES}.`);
    edges.length = MAX_GRAPH_EDGES;
  }

  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .filter(isRecord)
    .map((group, index) => {
      const label = text(group.label ?? group.name ?? group.title, 80);
      return label
        ? {
            id: text(group.id, 80) ?? slug(label, `group-${index + 1}`),
            label,
            nodeIds: stringList(group.nodeIds ?? group.nodes, MAX_GRAPH_NODES, 80),
            kind: text(group.kind, 80),
          }
        : null;
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
  if (groups.length > MAX_GRAPH_GROUPS) {
    warnings.push(`Dropped ${groups.length - MAX_GRAPH_GROUPS} group(s) beyond the limit of ${MAX_GRAPH_GROUPS}.`);
    groups.length = MAX_GRAPH_GROUPS;
  }

  return { graph: aiGraphDraftSchema.parse({ nodes, edges, groups }), warnings };
};

export const normalizeModelGraphDraft = (value: unknown): AIGraphDraftOutput =>
  normalizeModelGraphDraftDetailed(value).graph;

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

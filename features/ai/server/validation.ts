import {
  AIDiagramDocumentV1,
  AIDiagramEdge,
  AIDiagramGroup,
  AIDiagramNode,
  AIDiagramType,
  AIModelProvider,
  AIDiagramValidationIssue,
  AIDiagramValidationReport,
  AILayoutStrategy,
  AIAnnotation,
  AIArchitectureComponent,
  AICommunicationProtocol,
  AIContainer,
  AICriticNote,
  AIRequirement,
  AITrustBoundary,
  AIToolResult,
  AIVisualImportance,
} from "@/features/ai/types";
import { AIGraphDraftOutput, AIPlanOutput } from "@/features/ai/schemas";

const KIND_HINTS: Array<[RegExp, AIDiagramNode["kind"]]> = [
  [/\b(db|database|postgres|mysql|mongo|sql)\b/i, "database"],
  [/\b(cache|redis|memcache)\b/i, "cache"],
  [/\b(queue|broker|kafka|rabbit|pubsub|sqs)\b/i, "queue"],
  [/\b(event bus|events?)\b/i, "event-bus"],
  [/\b(dns|domain name)\b/i, "dns"],
  [/\b(waf|web application firewall)\b/i, "waf"],
  [/\b(firewall|security group|network acl)\b/i, "firewall"],
  [/\b(api gateway|gateway|ingress)\b/i, "gateway"],
  [/\b(api|graphql|rest)\b/i, "api"],
  [/\b(frontend|front end|web client|web app|react|next\.?js)\b/i, "browser"],
  [/\b(backend|back end|app server|application server)\b/i, "service"],
  [/\b(auth|identity|oauth|login|jwt)\b/i, "authentication"],
  [/\b(user|customer|admin|operator)\b/i, "user"],
  [/\b(browser|web app|frontend)\b/i, "browser"],
  [/\b(mobile|ios|android)\b/i, "mobile"],
  [/\b(lambda|function)\b/i, "lambda"],
  [/\b(vector|embedding)\b/i, "vector-store"],
  [/\b(model|llm|ai)\b/i, "ai-model"],
  [/\b(agent)\b/i, "agent"],
  [/\b(tool)\b/i, "tool"],
  [/\b(memory)\b/i, "memory"],
  [/\b(worker|job processor|consumer)\b/i, "worker"],
  [/\b(service mesh|istio|linkerd)\b/i, "service-mesh"],
  [/\b(deployment)\b/i, "deployment"],
  [/\b(namespace)\b/i, "namespace"],
  [/\b(region)\b/i, "region"],
  [/\b(availability zone|az)\b/i, "availability-zone"],
  [/\b(dashboard|grafana)\b/i, "dashboard"],
  [/\b(alert|pagerduty|alerting)\b/i, "alerting"],
  [/\b(config|configuration|feature flag)\b/i, "config"],
  [/\b(ci\/cd|cicd|pipeline|github actions)\b/i, "cicd"],
  [/\b(secret|vault|key)\b/i, "secrets"],
  [/\b(cdn)\b/i, "cdn"],
  [/\b(load balancer|lb)\b/i, "load-balancer"],
  [/\b(server|host)\b/i, "server"],
  [/\b(decision|if|approved|valid|success|fail|\?)\b/i, "decision"],
];

export const createEmptyValidationReport = (): AIDiagramValidationReport => ({
  valid: false,
  repaired: false,
  issues: [],
  metrics: {
    nodeCount: 0,
    edgeCount: 0,
    groupCount: 0,
    disconnectedComponents: 0,
    duplicateIds: 0,
    invalidEdges: 0,
    overlapCount: 0,
    orphanNodes: 0,
    oversizedRows: 0,
    poorSpacing: 0,
  },
});

export const slugId = (value: string, fallback: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
};

const inferKind = (node: Pick<AIDiagramNode, "label" | "kind">) => {
  if (node.kind && node.kind !== "generic") return node.kind;
  const match = KIND_HINTS.find(([regex]) => regex.test(node.label));
  return match?.[1] ?? "generic";
};

const inferLayer = (node: AIDiagramNode): AIDiagramNode["layer"] => {
  if (node.layer) return node.layer;
  if (node.kind === "user" || node.kind === "browser" || node.kind === "mobile") {
    return "edge";
  }
  if (
    node.kind === "database" ||
    node.kind === "cache" ||
    node.kind === "storage" ||
    node.kind === "queue" ||
    node.kind === "message-broker" ||
    node.kind === "event-bus" ||
    node.kind === "vector-store" ||
    node.kind === "memory"
  ) {
    return "data";
  }
  if (node.kind === "dashboard" || node.kind === "alerting") {
    return "observability";
  }
  if (node.kind === "external" || node.kind === "cdn" || node.kind === "internet" || node.kind === "dns" || node.kind === "waf" || node.kind === "firewall") {
    return "external";
  }
  return "application";
};

const countComponents = (nodes: AIDiagramNode[], edges: AIDiagramEdge[]) => {
  if (nodes.length === 0) return 0;
  const neighbors = new Map<string, Set<string>>();
  nodes.forEach((node) => neighbors.set(node.id, new Set()));
  edges.forEach((edge) => {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  });

  let count = 0;
  const visited = new Set<string>();
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    count += 1;
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      neighbors.get(id)?.forEach((next) => {
        if (visited.has(next)) return;
        visited.add(next);
        queue.push(next);
      });
    }
  });
  return count;
};

export const sanitizeGraphDraft = (
  draft: AIGraphDraftOutput,
): {
  nodes: AIDiagramNode[];
  edges: AIDiagramEdge[];
  groups: AIDiagramGroup[];
  duplicateIds: number;
  invalidEdges: number;
} => {
  const nodes: AIDiagramNode[] = [];
  const usedIds = new Set<string>();
  let duplicateIds = 0;

  draft.nodes.forEach((rawNode, index) => {
    const fallback = `node-${index + 1}`;
    let id = slugId(rawNode.id || rawNode.label, fallback);
    if (usedIds.has(id)) {
      duplicateIds += 1;
      id = `${id}-${index + 1}`;
    }
    usedIds.add(id);
    const node: AIDiagramNode = {
      ...rawNode,
      id,
      label: rawNode.label.trim().slice(0, 80),
      kind: inferKind(rawNode),
      column:
        typeof rawNode.column === "number"
          ? Math.max(0, Math.floor(rawNode.column))
          : undefined,
    };
    node.layer = inferLayer(node);
    nodes.push(node);
  });

  const idByOriginal = new Map<string, string>();
  draft.nodes.forEach((node, index) => {
    idByOriginal.set(node.id, nodes[index]?.id ?? node.id);
  });

  const edgeKeys = new Set<string>();
  let invalidEdges = 0;
  const edges: AIDiagramEdge[] = [];
  draft.edges.forEach((edge, index) => {
    const from = idByOriginal.get(edge.from) ?? slugId(edge.from, "");
    const to = idByOriginal.get(edge.to) ?? slugId(edge.to, "");
    if (!usedIds.has(from) || !usedIds.has(to) || from === to) {
      invalidEdges += 1;
      return;
    }
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) {
      invalidEdges += 1;
      return;
    }
    edgeKeys.add(key);
    edges.push({
      ...edge,
      id: edge.id ? slugId(edge.id, `edge-${index + 1}`) : `edge-${index + 1}`,
      from,
      to,
      label: edge.label?.trim().slice(0, 80),
      relationship: edge.relationship?.trim().slice(0, 120),
    });
  });

  const groups = draft.groups
    .map((group, index) => ({
      ...group,
      id: slugId(group.id || group.label, `group-${index + 1}`),
      label: group.label.trim().slice(0, 80),
      nodeIds: group.nodeIds
        .map((id) => idByOriginal.get(id) ?? slugId(id, ""))
        .filter((id) => usedIds.has(id)),
    }))
    .filter((group) => group.nodeIds.length > 0);

  return { nodes, edges, groups, duplicateIds, invalidEdges };
};

export const buildValidationReport = (
  nodes: AIDiagramNode[],
  edges: AIDiagramEdge[],
  groups: AIDiagramGroup[],
  duplicateIds: number,
  invalidEdges: number,
): AIDiagramValidationReport => {
  const issues: AIDiagramValidationIssue[] = [];
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  });
  const orphanNodes = nodes.filter((node) => (degree.get(node.id) ?? 0) === 0).length;
  const rows = new Map<number, number>();
  nodes.forEach((node, index) => {
    const row = node.column ?? Math.floor(index / 6);
    rows.set(row, (rows.get(row) ?? 0) + 1);
  });
  const oversizedRows = Array.from(rows.values()).filter((count) => count > 8).length;
  const poorSpacing = oversizedRows;

  if (nodes.length === 0) {
    issues.push({
      code: "empty_graph",
      severity: "error",
      message: "The diagram has no valid nodes.",
    });
  }
  if (duplicateIds > 0) {
    issues.push({
      code: "duplicate_ids_repaired",
      severity: "warning",
      message: `${duplicateIds} duplicate ids were repaired.`,
    });
  }
  if (invalidEdges > 0) {
    issues.push({
      code: "invalid_edges_removed",
      severity: "warning",
      message: `${invalidEdges} invalid edges were removed.`,
    });
  }
  const components = countComponents(nodes, edges);
  if (components > 1 && nodes.length > 2) {
    issues.push({
      code: "disconnected_components",
      severity: "warning",
      message: `The graph has ${components} disconnected components.`,
    });
  }
  if (nodes.some((node) => node.label.trim().length === 0)) {
    issues.push({
      code: "missing_label",
      severity: "error",
      message: "One or more nodes have missing labels.",
    });
  }
  if (nodes.length === 1) {
    issues.push({
      code: "too_small_diagram",
      severity: "warning",
      message: "The diagram has only one node and may be too small to be useful.",
    });
  }
  if (orphanNodes > 0 && nodes.length > 2) {
    issues.push({
      code: "orphan_nodes",
      severity: "warning",
      message: `${orphanNodes} nodes are not connected to the main graph.`,
    });
  }
  if (oversizedRows > 0) {
    issues.push({
      code: "oversized_rows",
      severity: "warning",
      message: `${oversizedRows} layout rows contain too many nodes.`,
    });
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    valid: !hasErrors && nodes.length > 0,
    repaired: duplicateIds > 0 || invalidEdges > 0,
    issues,
    metrics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      groupCount: groups.length,
      disconnectedComponents: components,
      duplicateIds,
      invalidEdges,
      overlapCount: 0,
      orphanNodes,
      oversizedRows,
      poorSpacing,
    },
  };
};

const normalizeRequirement = (text: string, index: number, source: AIRequirement["source"]): AIRequirement => ({
  id: slugId(text, `requirement-${index + 1}`),
  text: text.trim().slice(0, 240),
  priority: index === 0 ? "must" : "should",
  source,
});

export const extractRequirementsFromPrompt = (prompt: string): AIRequirement[] => {
  const parts = prompt
    .split(/[.;\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 8);

  return (parts.length > 0 ? parts : [prompt]).map((part, index) =>
    normalizeRequirement(part, index, "prompt"),
  );
};

export const deriveArchitectureComponents = (
  nodes: AIDiagramNode[],
): AIArchitectureComponent[] =>
  nodes.map((node) => ({
    id: node.id,
    label: node.label,
    responsibility: node.description ?? `${node.label} participates in the generated ${node.kind} architecture.`,
    kind: node.kind,
    criticality: node.priority && node.priority >= 7 ? "high" : "medium",
  }));

const filterNodeIds = (nodeIds: string[], validIds: Set<string>) =>
  nodeIds.filter((id) => validIds.has(id));

const deriveContainers = (
  groups: AIDiagramGroup[],
  nodes: AIDiagramNode[],
): AIContainer[] => {
  const validIds = new Set(nodes.map((node) => node.id));
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    nodeIds: filterNodeIds(group.nodeIds, validIds),
    kind: group.kind === "data" || group.kind === "deployment" ? group.kind : "system",
  }));
};

const deriveCommunicationProtocols = (
  edges: AIDiagramEdge[],
): AICommunicationProtocol[] =>
  edges.map((edge, index) => ({
    id: edge.id ?? `protocol-${index + 1}`,
    from: edge.from,
    to: edge.to,
    protocol:
      edge.relationship?.match(/\b(kafka|sqs|pubsub|queue|event)\b/i)
        ? "event"
        : edge.label?.match(/\b(sql|query|read|write)\b/i)
          ? "SQL"
          : "HTTPS",
    pattern:
      edge.relationship?.match(/\b(async|event|queue|stream)\b/i) ||
      edge.label?.match(/\b(async|event|queue|stream)\b/i)
        ? "async"
        : "sync",
  }));

const deriveVisualImportance = (nodes: AIDiagramNode[]): AIVisualImportance[] =>
  nodes.map((node) => ({
    nodeId: node.id,
    score: Math.min(10, Math.max(1, node.priority ?? (node.layer === "application" ? 7 : 5))),
    reason: node.layer ? `${node.layer} layer component` : undefined,
  }));

const sanitizeTrustBoundaries = (
  trustBoundaries: AITrustBoundary[] | undefined,
  validIds: Set<string>,
): AITrustBoundary[] =>
  (trustBoundaries ?? [])
    .map((boundary, index) => ({
      ...boundary,
      id: slugId(boundary.id || boundary.label, `boundary-${index + 1}`),
      label: boundary.label.trim().slice(0, 80),
      nodeIds: filterNodeIds(boundary.nodeIds, validIds),
    }))
    .filter((boundary) => boundary.nodeIds.length > 0);

export const buildAIDiagramDocument = ({
  prompt,
  plan,
  graph,
  provider,
  modelName,
  generationId,
  improvementPasses,
  requirements,
  architecture,
  containers,
  annotations,
  trustBoundaries,
  communicationProtocols,
  visualImportance,
  risks = [],
  criticNotes = [],
  toolResults = [],
}: {
  prompt: string;
  plan: AIPlanOutput;
  graph: AIGraphDraftOutput;
  provider: AIModelProvider;
  modelName: string;
  generationId: string;
  improvementPasses: number;
  requirements?: AIRequirement[];
  architecture?: AIArchitectureComponent[];
  containers?: AIContainer[];
  annotations?: AIAnnotation[];
  trustBoundaries?: AITrustBoundary[];
  communicationProtocols?: AICommunicationProtocol[];
  visualImportance?: AIVisualImportance[];
  risks?: string[];
  criticNotes?: AICriticNote[];
  toolResults?: AIToolResult[];
}): AIDiagramDocumentV1 => {
  const { nodes, edges, groups, duplicateIds, invalidEdges } =
    sanitizeGraphDraft(graph);
  const validation = buildValidationReport(
    nodes,
    edges,
    groups,
    duplicateIds,
    invalidEdges,
  );
  const validIds = new Set(nodes.map((node) => node.id));
  const normalizedRequirements =
    requirements && requirements.length > 0
      ? requirements
      : plan.requirements.length > 0
        ? plan.requirements
        : extractRequirementsFromPrompt(prompt);
  const normalizedArchitecture =
    architecture && architecture.length > 0 ? architecture : deriveArchitectureComponents(nodes);
  const normalizedContainers =
    containers && containers.length > 0 ? containers : deriveContainers(groups, nodes);
  const normalizedProtocols =
    communicationProtocols && communicationProtocols.length > 0
      ? communicationProtocols.filter(
          (protocol) => validIds.has(protocol.from) && validIds.has(protocol.to),
        )
      : deriveCommunicationProtocols(edges);

  return {
    schemaVersion: "ai-diagram-v1",
    diagramType: plan.diagramType,
    intent: {
      prompt,
      summary: plan.summary,
    },
    nodes,
    edges,
    groups,
    requirements: normalizedRequirements,
    architecture: normalizedArchitecture,
    containers: normalizedContainers,
    annotations: annotations ?? [],
    trustBoundaries: sanitizeTrustBoundaries(trustBoundaries, validIds),
    communicationProtocols: normalizedProtocols,
    visualImportance:
      visualImportance && visualImportance.length > 0
        ? visualImportance.filter((importance) => validIds.has(importance.nodeId))
        : deriveVisualImportance(nodes),
    layoutHints: {
      strategy: plan.layoutStrategy as AILayoutStrategy,
      direction: plan.direction,
    },
    styleHints: {
      theme: plan.styleTheme,
      density: plan.density,
    },
    validation,
    metadata: {
      generationId,
      createdAt: new Date().toISOString(),
      provider,
      model: modelName,
      improvementPasses,
    },
    reasoningMetadata: {
      requirementsSummary: normalizedRequirements.map((requirement) => requirement.text).join("; "),
      architectureSummary: plan.summary,
      risks,
      criticNotes: criticNotes.map((note) => note.message),
      toolResults: toolResults.map((result) => ({
        toolName: result.toolName,
        summary: result.summary,
      })),
    },
  };
};

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { buildAnchorId } from "@/core/anchors/generate-anchors";
import {
  RouteArrowDescriptor,
  routeArrowBatch,
} from "@/core/routing/orthogonal-router";
import { RoutingObstacle } from "@/core/routing/obstacle-avoidance";
import { computeArchitectureLayeredLayout } from "@/core/layout/layered-layout";
import {
  ArchitectureLayerName,
  parseArchitectureLayerName,
} from "@/core/layout/layer-constraint";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

/**
 * Separation of concerns:
 * AI: emits only logical graph (ids, labels, node types, edges)
 * Layout engine: computes visual positions + route handles
 * Renderer mapping: converts positioned nodes + edges into canvas elements
 */
type DiagramIntent = "architecture" | "flowchart" | "concept";

const ARCHITECTURE_HINT_RE =
  /\b(architecture|system|frontend|backend|database|microservice|api|client|server|service|queue|cache|infra)\b/i;
const FLOWCHART_HINT_RE =
  /\b(flowchart|workflow|process|steps?|decision|approval|algorithm|state\s*machine|pipeline|procedure)\b/i;

function detectDiagramIntent(prompt: string): DiagramIntent {
  if (FLOWCHART_HINT_RE.test(prompt)) return "flowchart";
  if (ARCHITECTURE_HINT_RE.test(prompt)) return "architecture";
  return "concept";
}

function buildSystemPrompt(intent: DiagramIntent): string {
  const common = `
You are an expert diagram architect.
Generate ONLY a logical graph as valid JSON:
{
  "nodes": [...],
  "edges": [...]
}

Hard rules:
- No markdown.
- No explanations.
- Unique node ids.
- Labels must be concise (1-4 words).
- Node type must be "rectangle", "circle", or "diamond".
- Use "diamond" ONLY for explicit branching/decision logic.
- Do not emit any visual coordinates.
- Keep graph small and readable (3-14 nodes).
- Avoid unnecessary cycles.
- Optimize for human readability over completeness.
- Return one coherent diagram only. Do not mix unrelated sub-diagrams.

Node format:
{
  "id": "string",
  "label": "string",
  "type": "rectangle" | "circle" | "diamond",
  "layer"?: "edge" | "application" | "data" | "observability",
  "column"?: number
}

Edge format:
{
  "from": "node_id",
  "to": "node_id",
  "bidirectional"?: boolean,
  "dashed"?: boolean
}

Use "bidirectional": true only when relationship is explicitly two-way.
Readability constraints:
- Model primary relationships only (avoid dense all-to-all edges).
- Prefer hierarchical flow and minimal edge crossings.
- If a relationship is secondary, omit it unless essential.
`;

  if (intent === "architecture") {
    return `${common}
Intent rules (architecture):
- Model components/services/stores, not process steps.
- Do NOT invent generic nodes like "Start" or "End" unless user explicitly asked.
- Prefer rectangle for app/service components.
- Use circle for databases, caches, queues, or external systems.
- If direction is not explicit, default left-to-right dependency/data flow:
  client/frontend -> api/backend/services -> data stores/infrastructure.
- Enforce strict top-to-bottom layers:
  edge (top) -> application -> data -> observability (bottom).
- Every node must include "layer" and "column".
- Keep dependency graph sparse and layered.
- Avoid direct edges that skip obvious middle layers.
- Avoid connecting one node to too many distant nodes unless explicitly requested.

Layout constraints:
- Maximum 4-5 nodes per layer for readability.
- Column indices must be sequential within each layer (0, 1, 2, ...).
- Keep total columns per layer under 6 to prevent horizontal sprawl.
- Cluster related services into adjacent columns.
- Prefer vertical edges between layers; minimize same-layer horizontal edges.
- Never create edges that skip more than 1 layer unless absolutely essential.
- Group domain-related nodes (e.g. order/payment, auth/user) in adjacent columns.`;
  }

  if (intent === "flowchart") {
    return `${common}
Intent rules (flowchart):
- Model process steps in sequence.
- Include Start/End only when they improve clarity or are explicitly requested.
- Use diamond for conditional branches.
- Keep decision fan-out minimal and coherent.`;
  }

  return `${common}
Intent rules (concept):
- Model entities and relationships as a concept map.
- Do NOT invent generic process nodes (e.g., Start/End) unless explicitly requested.`;
}

function buildUserPrompt(prompt: string, intent: DiagramIntent): string {
  const lines = [
    `User request: ${prompt}`,
    `Detected diagram intent: ${intent}`,
    "Return strictly valid JSON with keys: nodes, edges.",
    "Use only entities from the request (or very strongly implied ones).",
  ];

  if (intent === "architecture") {
    lines.push(
      "Architecture constraints:",
      '- Assign every node a "layer" in: edge, application, data, observability.',
      '- Assign every node a numeric "column" starting at 0 within its layer.',
      "- Keep each layer to at most 5 columns (0-4). Use fewer columns when possible.",
      "- Minimize horizontal sprawl and keep total width compact.",
      "- Prefer vertical dependencies between layers; keep same-layer links minimal.",
      "- Avoid random lateral links and avoid cross-layer skipping.",
      "- Cluster related services (e.g. order/payment/observability) in adjacent columns.",
      "- Every edge should connect nodes in adjacent layers when possible.",
      "- Penalize any edge that crosses more than 1 layer boundary.",
      "- Keep the total node count under 14 for clarity.",
    );
  }

  return lines.join("\n");
}

type ShapeType = "rectangle" | "circle" | "diamond";
type Handle = "top" | "right" | "bottom" | "left";

interface NodeJson {
  id: string;
  label: string;
  type?: ShapeType;
  layer?: string;
  column?: number;
}

interface EdgeJson {
  from: string;
  to: string;
  bidirectional?: boolean;
  dashed?: boolean;
}

interface DiagramJson {
  nodes: NodeJson[];
  edges: EdgeJson[];
}

interface LogicalNode {
  id: string;
  label: string;
  shape: ShapeType;
  layer?: ArchitectureLayerName;
  column?: number;
}

interface LogicalEdge {
  from: string;
  to: string;
  bidirectional?: boolean;
  dashed?: boolean;
}

interface LogicalGraph {
  nodes: LogicalNode[];
  edges: LogicalEdge[];
}

interface LayoutConfig {
  canvasPaddingX: number;
  canvasPaddingY: number;
  minSiblingGap: number;
  componentGap: number;
  layerGap: number;
  rectangleWidth: number;
  rectangleHeight: number;
  circleDiameter: number;
  diamondSize: number;
  decisionSplitGap: number;
}

interface LayoutNode {
  id: string;
  label: string;
  shape: ShapeType;
  width: number;
  height: number;
  depth: number;
  x: number;
  y: number;
  parentId: string | null;
  children: string[];
  incomingCount: number;
  outgoingCount: number;
  isDecision: boolean;
  isMerge: boolean;
}

interface NodeVisualStyle {
  fill: string;
  color: string;
}

type CanvasElement = {
  id: string;
  type:
    | "rectangle"
    | "circle"
    | "diamond"
    | "text"
    | "line"
    | "arrow"
    | "arrow-bidirectional";
  label?: string;
  text?: string;
  points: { x: number; y: number }[];
  fill?: string;
  color: string;
  strokeWidth: number;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  routingMode?: "straight" | "orthogonal";
  routePreference?: "vh" | "hv";
  isManuallyRouted?: boolean;
  startConnection?: { elementId: string; anchorId: string };
  endConnection?: { elementId: string; anchorId: string };
  isGuide?: boolean;
};

function generateShortId(index: number) {
  return `ai_${Date.now()}_${index}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toShapeType(node: NodeJson, intent: DiagramIntent): ShapeType {
  if (node.type === "diamond") return "diamond";
  if (node.type === "circle") return "circle";
  if (node.type === "rectangle") return "rectangle";

  const label = node.label.toLowerCase();
  if (/\?|decision|if|approved|valid|success|fail|eligible/.test(label)) {
    return "diamond";
  }
  const storageRegex =
    /(db|database|terminal|cache|redis|postgres|mysql|queue|broker|kafka|s3|blob|storage)/;
  if (storageRegex.test(label)) {
    return "circle";
  }
  if (intent === "flowchart" && /(start|end|begin|finish|stop)/.test(label)) {
    return "circle";
  }
  return "rectangle";
}

function toArchitectureLayerHint(
  layer: string | undefined,
): ArchitectureLayerName | undefined {
  const parsed = parseArchitectureLayerName(layer);
  return parsed ?? undefined;
}

function toColumnHint(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLabelMentionedInPrompt(prompt: string, label: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  const escaped = escapeRegExp(normalized).replace(/\s+/g, "\\s+");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(prompt);
}

function stripSyntheticTerminalNodes(
  graph: LogicalGraph,
  prompt: string,
  intent: DiagramIntent,
): LogicalGraph {
  if (intent === "flowchart") return graph;

  const { incoming, outgoing } = buildAdjacency(graph);
  const removable = new Set<string>();

  for (const node of graph.nodes) {
    const label = node.label.trim().toLowerCase();
    const indegree = incoming.get(node.id)?.length ?? 0;
    const outdegree = outgoing.get(node.id)?.length ?? 0;
    const mentioned = isLabelMentionedInPrompt(prompt.toLowerCase(), label);

    if (mentioned) continue;

    if (
      /^(start|begin|entry|source)$/.test(label) &&
      indegree === 0 &&
      outdegree <= 1
    ) {
      removable.add(node.id);
      continue;
    }

    if (
      /^(end|finish|stop|exit|done|complete)$/.test(label) &&
      outdegree === 0 &&
      indegree <= 1
    ) {
      removable.add(node.id);
    }
  }

  if (removable.size === 0) return graph;

  return {
    nodes: graph.nodes.filter((node) => !removable.has(node.id)),
    edges: graph.edges.filter(
      (edge) => !removable.has(edge.from) && !removable.has(edge.to),
    ),
  };
}

function sanitizeGraph(
  raw: DiagramJson,
  intent: DiagramIntent,
  prompt: string,
): LogicalGraph {
  const nodesById = new Map<string, LogicalNode>();

  for (const node of raw.nodes ?? []) {
    if (
      !node ||
      typeof node.id !== "string" ||
      typeof node.label !== "string"
    ) {
      continue;
    }

    const id = node.id.trim();
    const label = node.label.trim();
    if (!id || !label || nodesById.has(id)) continue;

    nodesById.set(id, {
      id,
      label: label.slice(0, 48),
      shape: toShapeType(node, intent),
      layer:
        intent === "architecture"
          ? toArchitectureLayerHint(node.layer)
          : undefined,
      column: intent === "architecture" ? toColumnHint(node.column) : undefined,
    });
  }

  const uniqueEdges = new Set<string>();
  const edges: LogicalEdge[] = [];

  for (const edge of raw.edges ?? []) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      continue;
    }
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!from || !to || from === to) continue;
    if (!nodesById.has(from) || !nodesById.has(to)) continue;

    const key = `${from}->${to}`;
    if (uniqueEdges.has(key)) continue;
    uniqueEdges.add(key);
    edges.push({
      from,
      to,
      bidirectional: Boolean(edge.bidirectional),
      dashed: Boolean(edge.dashed),
    });
  }

  const graph = {
    nodes: Array.from(nodesById.values()),
    edges,
  };

  return stripSyntheticTerminalNodes(graph, prompt, intent);
}

function canReachTarget(
  graph: LogicalGraph,
  sourceId: string,
  targetId: string,
  excludedEdgeIndex: number,
): boolean {
  const queue = [sourceId];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (let i = 0; i < graph.edges.length; i += 1) {
      if (i === excludedEdgeIndex) continue;
      const edge = graph.edges[i];
      if (edge.from !== current) continue;
      if (edge.to === targetId) return true;
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }

  return false;
}

function reduceTransitiveEdges(graph: LogicalGraph): LogicalGraph {
  if (graph.edges.length <= 2) return graph;

  const kept: LogicalEdge[] = [];
  const candidateGraph: LogicalGraph = {
    nodes: graph.nodes,
    edges: [...graph.edges],
  };

  for (let i = 0; i < graph.edges.length; i += 1) {
    const edge = graph.edges[i];

    // Preserve explicit styling/semantics.
    if (edge.bidirectional || edge.dashed) {
      kept.push(edge);
      continue;
    }

    const removable = canReachTarget(candidateGraph, edge.from, edge.to, i);

    if (!removable) {
      kept.push(edge);
    }
  }

  return {
    nodes: graph.nodes,
    edges: kept,
  };
}

function simplifyGraphForReadability(
  graph: LogicalGraph,
  intent: DiagramIntent,
): LogicalGraph {
  let simplified = graph;

  // For dense graphs, remove redundant direct edges that already have an alternate route.
  if (simplified.edges.length > simplified.nodes.length + 2) {
    simplified = reduceTransitiveEdges(simplified);
  }

  // Architecture diagrams are most affected by edge noise; run a second pass.
  if (
    intent === "architecture" &&
    simplified.edges.length > simplified.nodes.length + 1
  ) {
    simplified = reduceTransitiveEdges(simplified);
  }

  return simplified;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "from",
  "by",
  "is",
  "are",
  "be",
  "or",
  "as",
  "at",
  "it",
  "this",
  "that",
  "diagram",
  "system",
  "process",
  "flow",
  "chart",
]);

function tokenizeTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function buildConnectedComponents(graph: LogicalGraph): string[][] {
  const neighbors = new Map<string, Set<string>>();
  graph.nodes.forEach((node) => neighbors.set(node.id, new Set<string>()));
  graph.edges.forEach((edge) => {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  });

  const components: string[][] = [];
  const visited = new Set<string>();

  graph.nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const queue = [node.id];
    const component: string[] = [];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      const nextNodes = neighbors.get(current);
      if (!nextNodes) continue;
      nextNodes.forEach((candidate) => {
        if (visited.has(candidate)) return;
        visited.add(candidate);
        queue.push(candidate);
      });
    }
    components.push(component);
  });

  return components;
}

function scoreComponent(
  nodeIds: string[],
  graph: LogicalGraph,
  promptTerms: Set<string>,
): number {
  const nodeIdSet = new Set(nodeIds);
  const nodes = graph.nodes.filter((node) => nodeIdSet.has(node.id));
  const edges = graph.edges.filter(
    (edge) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to),
  );

  const labelTerms = new Set<string>();
  nodes.forEach((node) => {
    tokenizeTerms(node.label).forEach((term) => labelTerms.add(term));
  });

  let overlap = 0;
  labelTerms.forEach((term) => {
    if (promptTerms.has(term)) overlap += 1;
  });

  return overlap * 12 + edges.length * 1.5 + nodes.length * 0.75;
}

function shouldPreserveMultiComponent(prompt: string): boolean {
  return /\b(compare|versus|vs\.?|multiple|two diagrams|three diagrams|side[-\s]?by[-\s]?side|alternatives?)\b/i.test(
    prompt,
  );
}

function keepMostRelevantComponent(
  graph: LogicalGraph,
  prompt: string,
): LogicalGraph {
  const components = buildConnectedComponents(graph);
  if (components.length <= 1) return graph;
  if (shouldPreserveMultiComponent(prompt)) return graph;

  const promptTerms = new Set(tokenizeTerms(prompt));
  const ranked = components
    .map((component) => ({
      component,
      score: scoreComponent(component, graph, promptTerms),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.component.length === 0) return graph;

  const keepIds = new Set(best.component);
  const nextNodes = graph.nodes.filter((node) => keepIds.has(node.id));
  const nextEdges = graph.edges.filter(
    (edge) => keepIds.has(edge.from) && keepIds.has(edge.to),
  );

  if (nextNodes.length < 2) return graph;
  return { nodes: nextNodes, edges: nextEdges };
}

function buildAdjacency(graph: LogicalGraph) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const node of graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of graph.edges) {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  return { incoming, outgoing };
}

function computeNodeDepths(graph: LogicalGraph): Map<string, number> {
  const { incoming, outgoing } = buildAdjacency(graph);
  const indegree = new Map<string, number>();
  const depth = new Map<string, number>();

  for (const node of graph.nodes) {
    indegree.set(node.id, incoming.get(node.id)?.length ?? 0);
    depth.set(node.id, 0);
  }

  const queue = graph.nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.add(current);

    for (const child of outgoing.get(current) ?? []) {
      depth.set(
        child,
        Math.max(depth.get(child) ?? 0, (depth.get(current) ?? 0) + 1),
      );
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if ((indegree.get(child) ?? 0) === 0) queue.push(child);
    }
  }

  // Fallback for cycles/unvisited components.
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    const localQueue = [node.id];
    const seen = new Set<string>([node.id]);
    depth.set(node.id, Math.max(0, depth.get(node.id) ?? 0));

    while (localQueue.length > 0) {
      const current = localQueue.shift()!;
      visited.add(current);
      for (const child of outgoing.get(current) ?? []) {
        const nextDepth = Math.max(
          depth.get(child) ?? 0,
          (depth.get(current) ?? 0) + 1,
        );
        depth.set(child, nextDepth);
        if (!seen.has(child)) {
          seen.add(child);
          localQueue.push(child);
        }
      }
    }
  }

  return depth;
}

function inferArchitectureBand(node: LogicalNode): number {
  const label = node.label.toLowerCase();

  // Edge/entry layer.
  if (
    /(user|users|client|browser|mobile|web app|frontend|cdn|waf|gateway|ingress|edge)/.test(
      label,
    )
  ) {
    return 0;
  }

  // Core app/service layer.
  if (
    /(api|service|backend|app|auth|product|order|cart|search|payment|notification)/.test(
      label,
    )
  ) {
    return 1;
  }

  // Async/worker layer.
  if (/(queue|broker|kafka|event|worker|consumer|job)/.test(label)) {
    return 2;
  }

  // Data/storage layer.
  if (
    /(db|database|postgres|mysql|redis|cache|storage|blob|s3|bucket|object)/.test(
      label,
    )
  ) {
    return 3;
  }

  // Observability/support layer.
  if (/(monitor|metrics|logging|analytics|trace|audit)/.test(label)) {
    return 4;
  }

  return node.shape === "circle" ? 3 : 1;
}

function applyDepthBiasByIntent(
  graph: LogicalGraph,
  depth: Map<string, number>,
  intent: DiagramIntent,
): Map<string, number> {
  if (intent !== "architecture") return depth;

  const adjusted = new Map<string, number>();
  graph.nodes.forEach((node) => {
    const baseDepth = depth.get(node.id) ?? 0;
    const preferredBand = inferArchitectureBand(node);
    adjusted.set(node.id, Math.max(baseDepth, preferredBand));
  });

  const orderedLevels = Array.from(new Set(adjusted.values())).sort(
    (a, b) => a - b,
  );
  const levelToDense = new Map<number, number>();
  orderedLevels.forEach((level, idx) => levelToDense.set(level, idx));

  const denseDepth = new Map<string, number>();
  adjusted.forEach((level, nodeId) => {
    denseDepth.set(nodeId, levelToDense.get(level) ?? level);
  });

  return denseDepth;
}

function pickPrimaryParents(
  graph: LogicalGraph,
  depth: Map<string, number>,
  incoming: Map<string, string[]>,
): Map<string, string | null> {
  const parentOf = new Map<string, string | null>();

  for (const node of graph.nodes) {
    const parents = incoming.get(node.id) ?? [];
    if (parents.length === 0) {
      parentOf.set(node.id, null);
      continue;
    }

    const nodeDepth = depth.get(node.id) ?? 0;
    const ranked = [...parents].sort((a, b) => {
      const da = depth.get(a) ?? 0;
      const db = depth.get(b) ?? 0;
      const aValid = da < nodeDepth ? 1 : 0;
      const bValid = db < nodeDepth ? 1 : 0;
      if (aValid !== bValid) return bValid - aValid;
      if (da !== db) return db - da;
      return a.localeCompare(b);
    });

    const bestParent = ranked[0];
    const bestParentDepth = depth.get(bestParent) ?? 0;
    if (bestParentDepth >= nodeDepth) {
      parentOf.set(node.id, null);
    } else {
      parentOf.set(node.id, bestParent);
    }
  }

  return parentOf;
}

function createLayoutConfig(
  graph: LogicalGraph,
  maxDepth: number,
  intent: DiagramIntent,
): LayoutConfig {
  const nodeCount = graph.nodes.length;
  const depthSpan = Math.max(1, maxDepth + 1);
  const architecture = intent === "architecture";

  return {
    canvasPaddingX: 130,
    canvasPaddingY: 96,
    minSiblingGap: architecture
      ? clamp(170 - nodeCount * 0.9, 96, 156)
      : clamp(150 - nodeCount * 1.2, 72, 132),
    componentGap: architecture
      ? clamp(380 - nodeCount * 1.1, 260, 360)
      : clamp(360 - nodeCount * 1.3, 220, 340),
    // Tighter vertical rhythm so AI flowchart arrows are shorter and cleaner.
    layerGap: architecture
      ? clamp(150 - depthSpan * 2, 96, 140)
      : clamp(136 - depthSpan * 3, 72, 120),
    rectangleWidth: architecture
      ? clamp(212 + Math.floor(nodeCount / 16) * 8, 212, 268)
      : clamp(200 + Math.floor(nodeCount / 18) * 8, 200, 252),
    rectangleHeight: 76,
    circleDiameter: 92,
    diamondSize: 128,
    decisionSplitGap: clamp(220 - nodeCount * 0.8, 140, 220),
  };
}

function estimateCircleDiameter(label: string, base: number) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((acc, w) => Math.max(acc, w.length), 0);
  const totalChars = label.replace(/\s+/g, "").length;
  const byLongest = base + Math.max(0, longestWord - 6) * 7;
  const byTotal = base + Math.max(0, totalChars - 10) * 3;
  return clamp(Math.max(byLongest, byTotal), base, 164);
}

function estimateRectangleWidth(label: string, base: number) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const longestWord = words.reduce(
    (acc, word) => Math.max(acc, word.length),
    0,
  );
  const totalChars = label.replace(/\s+/g, "").length;
  const byLongest = base + Math.max(0, longestWord - 10) * 6;
  const byTotal = base + Math.max(0, totalChars - 18) * 3;
  return clamp(Math.max(byLongest, byTotal), base, 320);
}

function estimateDiamondSize(label: string, base: number) {
  const total = label.replace(/\s+/g, "").length;
  return clamp(base + Math.max(0, total - 8) * 4, 110, 172);
}

function createInitialLayoutNodes(
  graph: LogicalGraph,
  depth: Map<string, number>,
  parentOf: Map<string, string | null>,
  incoming: Map<string, string[]>,
  outgoing: Map<string, string[]>,
  config: LayoutConfig,
) {
  const layoutNodes = new Map<string, LayoutNode>();

  for (const node of graph.nodes) {
    let width = config.rectangleWidth;
    let height = config.rectangleHeight;

    if (node.shape === "circle") {
      width = estimateCircleDiameter(node.label, config.circleDiameter);
      height = width;
    } else if (node.shape === "diamond") {
      width = estimateDiamondSize(node.label, config.diamondSize);
      height = width;
    } else {
      width = estimateRectangleWidth(node.label, config.rectangleWidth);
    }

    const incomingCount = incoming.get(node.id)?.length ?? 0;
    const outgoingCount = outgoing.get(node.id)?.length ?? 0;

    layoutNodes.set(node.id, {
      id: node.id,
      label: node.label,
      shape: node.shape,
      width,
      height,
      depth: depth.get(node.id) ?? 0,
      x: 0,
      y: 0,
      parentId: parentOf.get(node.id) ?? null,
      children: [],
      incomingCount,
      outgoingCount,
      isDecision: node.shape === "diamond",
      isMerge: incomingCount > 1,
    });
  }

  for (const node of layoutNodes.values()) {
    if (node.parentId && layoutNodes.has(node.parentId)) {
      layoutNodes.get(node.parentId)!.children.push(node.id);
    }
  }

  return layoutNodes;
}

function branchHint(label: string): -1 | 0 | 1 {
  const txt = label.toLowerCase();
  if (/\b(no|false|fail|reject|deny|invalid|error)\b/.test(txt)) return -1;
  if (/\b(yes|true|pass|approve|allow|valid|success)\b/.test(txt)) return 1;
  return 0;
}

function orderChildrenForFlow(
  parent: LayoutNode,
  childIds: string[],
  layoutNodes: Map<string, LayoutNode>,
) {
  const sorted = [...childIds].sort((a, b) => {
    const na = layoutNodes.get(a)!;
    const nb = layoutNodes.get(b)!;
    if (na.depth !== nb.depth) return na.depth - nb.depth;
    return na.label.localeCompare(nb.label);
  });

  if (parent.isDecision && sorted.length >= 2) {
    const [first, second, ...rest] = sorted;
    const hintFirst = branchHint(layoutNodes.get(first)!.label);
    const hintSecond = branchHint(layoutNodes.get(second)!.label);

    let left = first;
    let right = second;

    if (hintFirst === 1 || hintSecond === -1) {
      left = second;
      right = first;
    } else if (hintFirst === 0 && hintSecond === 0) {
      if (
        layoutNodes
          .get(first)!
          .label.localeCompare(layoutNodes.get(second)!.label) > 0
      ) {
        left = second;
        right = first;
      }
    }

    return [left, right, ...rest];
  }

  return sorted;
}

function shiftSubtree(
  layoutNodes: Map<string, LayoutNode>,
  nodeId: string,
  deltaX: number,
) {
  if (deltaX === 0) return;
  const queue = [nodeId];
  const seen = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = layoutNodes.get(currentId);
    if (!node) continue;
    node.x += deltaX;
    for (const childId of node.children) {
      if (!seen.has(childId)) {
        seen.add(childId);
        queue.push(childId);
      }
    }
  }
}

function recenterParents(layoutNodes: Map<string, LayoutNode>) {
  const depths = Array.from(
    new Set(Array.from(layoutNodes.values()).map((n) => n.depth)),
  ).sort((a, b) => b - a);

  for (const depth of depths) {
    const nodes = Array.from(layoutNodes.values()).filter(
      (n) => n.depth === depth,
    );
    for (const node of nodes) {
      if (node.children.length === 0) continue;
      const children = node.children
        .map((id) => layoutNodes.get(id))
        .filter(Boolean) as LayoutNode[];
      if (children.length === 0) continue;
      const left = children[0].x;
      const right = children[children.length - 1].x;
      node.x = (left + right) / 2;
    }
  }
}

function placeForest(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
) {
  for (const parent of layoutNodes.values()) {
    parent.children = orderChildrenForFlow(
      parent,
      parent.children,
      layoutNodes,
    );
  }

  const subtreeWidthMemo = new Map<string, number>();

  const computeSubtreeWidth = (
    nodeId: string,
    stack = new Set<string>(),
  ): number => {
    if (subtreeWidthMemo.has(nodeId)) return subtreeWidthMemo.get(nodeId)!;
    if (stack.has(nodeId)) return layoutNodes.get(nodeId)?.width ?? 120;
    stack.add(nodeId);

    const node = layoutNodes.get(nodeId)!;
    if (node.children.length === 0) {
      subtreeWidthMemo.set(nodeId, node.width);
      stack.delete(nodeId);
      return node.width;
    }

    const childWidths = node.children.map((id) =>
      computeSubtreeWidth(id, stack),
    );
    let childrenWidth =
      childWidths.reduce((sum, w) => sum + w, 0) +
      Math.max(0, childWidths.length - 1) * config.minSiblingGap;

    if (node.isDecision && childWidths.length >= 2) {
      childrenWidth = Math.max(
        childrenWidth,
        childWidths[0] + childWidths[1] + config.decisionSplitGap,
      );
    }

    const width = Math.max(node.width, childrenWidth);
    subtreeWidthMemo.set(nodeId, width);
    stack.delete(nodeId);
    return width;
  };

  const placeNode = (nodeId: string, left: number): number => {
    const node = layoutNodes.get(nodeId)!;
    const subtreeWidth = computeSubtreeWidth(nodeId);

    if (node.children.length === 0) {
      node.x = left + subtreeWidth / 2;
      return left + subtreeWidth;
    }

    const childWidths = node.children.map((id) => computeSubtreeWidth(id));
    const gapCount = Math.max(0, node.children.length - 1);
    const requiredWidth =
      childWidths.reduce((acc, w) => acc + w, 0) +
      gapCount * config.minSiblingGap;
    let start = left + (subtreeWidth - requiredWidth) / 2;

    for (let i = 0; i < node.children.length; i += 1) {
      const childId = node.children[i];
      placeNode(childId, start);
      start +=
        childWidths[i] +
        (i < node.children.length - 1 ? config.minSiblingGap : 0);
    }

    const first = layoutNodes.get(node.children[0])!;
    const last = layoutNodes.get(node.children[node.children.length - 1])!;
    node.x = (first.x + last.x) / 2;
    return left + subtreeWidth;
  };

  const roots = Array.from(layoutNodes.values())
    .filter((n) => !n.parentId || !layoutNodes.has(n.parentId))
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.label.localeCompare(b.label);
    });

  let cursorX = 0;
  for (const root of roots) {
    const width = computeSubtreeWidth(root.id);
    placeNode(root.id, cursorX);
    cursorX += width + config.componentGap;
  }
}

function optimizeLayerOrdering(
  layoutNodes: Map<string, LayoutNode>,
  incoming: Map<string, string[]>,
  outgoing: Map<string, string[]>,
  config: LayoutConfig,
) {
  const byDepth = new Map<number, LayoutNode[]>();
  for (const node of layoutNodes.values()) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth)!.push(node);
  }
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);

  const enforceSpacing = (nodes: LayoutNode[]) => {
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const minX =
        prev.x + prev.width / 2 + config.minSiblingGap + curr.width / 2;
      if (curr.x < minX) {
        curr.x = minX;
      }
    }
  };

  const orderByBarycenter = (
    nodes: LayoutNode[],
    resolveNeighbors: (node: LayoutNode) => LayoutNode[],
  ) => {
    const originalCenter =
      nodes.reduce((sum, node) => sum + node.x, 0) / Math.max(nodes.length, 1);

    const ranked = nodes
      .map((node) => {
        const neighbors = resolveNeighbors(node);
        const barycenter =
          neighbors.length > 0
            ? neighbors.reduce((sum, neighbor) => sum + neighbor.x, 0) /
              neighbors.length
            : node.x;
        return { node, barycenter };
      })
      .sort((a, b) => {
        if (a.barycenter !== b.barycenter) return a.barycenter - b.barycenter;
        return a.node.label.localeCompare(b.node.label);
      });

    let cursor = Number.NEGATIVE_INFINITY;
    ranked.forEach(({ node, barycenter }) => {
      if (!Number.isFinite(cursor)) {
        node.x = barycenter;
      } else {
        const minX = cursor + config.minSiblingGap + node.width / 2;
        node.x = Math.max(barycenter, minX);
      }
      cursor = node.x + node.width / 2;
    });

    const nextCenter =
      ranked.reduce((sum, entry) => sum + entry.node.x, 0) /
      Math.max(ranked.length, 1);
    const centerShift = originalCenter - nextCenter;
    ranked.forEach(({ node }) => {
      node.x += centerShift;
    });

    enforceSpacing(nodes);
  };

  for (let pass = 0; pass < 2; pass += 1) {
    for (const depth of depths) {
      if (depth === depths[0]) continue;
      const nodes = byDepth.get(depth) ?? [];
      if (nodes.length <= 1) continue;
      orderByBarycenter(
        nodes,
        (node) =>
          (incoming.get(node.id) ?? [])
            .map((id) => layoutNodes.get(id))
            .filter(Boolean) as LayoutNode[],
      );
    }

    for (let i = depths.length - 1; i >= 0; i -= 1) {
      const depth = depths[i];
      if (depth === depths[depths.length - 1]) continue;
      const nodes = byDepth.get(depth) ?? [];
      if (nodes.length <= 1) continue;
      orderByBarycenter(
        nodes,
        (node) =>
          (outgoing.get(node.id) ?? [])
            .map((id) => layoutNodes.get(id))
            .filter(Boolean) as LayoutNode[],
      );
    }
  }
}

function findNearestCommonTarget(
  leftRoot: string,
  rightRoot: string,
  outgoing: Map<string, string[]>,
  depth: Map<string, number>,
) {
  const bfs = (start: string) => {
    const dist = new Map<string, number>();
    const queue = [start];
    dist.set(start, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const d = dist.get(current)!;
      for (const next of outgoing.get(current) ?? []) {
        if (!dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    return dist;
  };

  const leftDist = bfs(leftRoot);
  const rightDist = bfs(rightRoot);

  let best: { id: string; score: number; depth: number } | null = null;

  for (const [id, ld] of leftDist) {
    const rd = rightDist.get(id);
    if (rd === undefined) continue;
    if (id === leftRoot || id === rightRoot) continue;
    const d = depth.get(id) ?? 0;
    const score = ld + rd;
    if (!best || d < best.depth || (d === best.depth && score < best.score)) {
      best = { id, score, depth: d };
    }
  }

  return best?.id ?? null;
}

function applyDecisionAndMergeAlignment(
  layoutNodes: Map<string, LayoutNode>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  depth: Map<string, number>,
  config: LayoutConfig,
) {
  // 1) Split symmetry for decision nodes.
  for (const node of layoutNodes.values()) {
    if (!node.isDecision || node.children.length < 2) continue;
    const leftChild = layoutNodes.get(node.children[0]);
    const rightChild = layoutNodes.get(node.children[1]);
    if (!leftChild || !rightChild) continue;

    const desiredHalfSpan = Math.max(
      config.decisionSplitGap / 2,
      Math.abs(rightChild.x - leftChild.x) / 2,
    );

    const targetLeft = node.x - desiredHalfSpan;
    const targetRight = node.x + desiredHalfSpan;

    shiftSubtree(layoutNodes, leftChild.id, targetLeft - leftChild.x);
    shiftSubtree(layoutNodes, rightChild.id, targetRight - rightChild.x);
  }

  // 2) Decision-aware merge alignment: center merge nodes under split branches.
  for (const decision of layoutNodes.values()) {
    if (!decision.isDecision || decision.children.length < 2) continue;
    const [leftId, rightId] = decision.children;
    const mergeCandidateId = findNearestCommonTarget(
      leftId,
      rightId,
      outgoing,
      depth,
    );
    if (!mergeCandidateId) continue;

    const mergeNode = layoutNodes.get(mergeCandidateId);
    if (!mergeNode || !mergeNode.isMerge) continue;
    shiftSubtree(layoutNodes, mergeNode.id, decision.x - mergeNode.x);
  }

  // 3) Generic merge alignment for remaining multi-input nodes.
  for (const node of layoutNodes.values()) {
    if (!node.isMerge) continue;
    const parents = incoming.get(node.id) ?? [];
    if (parents.length < 2) continue;

    const parentXs = parents
      .map((id) => layoutNodes.get(id))
      .filter(Boolean)
      .map((p) => (p as LayoutNode).x)
      .sort((a, b) => a - b);
    if (parentXs.length < 2) continue;

    const targetX = (parentXs[0] + parentXs[parentXs.length - 1]) / 2;
    shiftSubtree(layoutNodes, node.id, targetX - node.x);
  }
}

function resolveHorizontalCollisions(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
) {
  const byDepth = new Map<number, LayoutNode[]>();
  for (const node of layoutNodes.values()) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth)!.push(node);
  }

  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    const nodes = (byDepth.get(depth) ?? []).sort((a, b) => a.x - b.x);
    for (let i = 1; i < nodes.length; i += 1) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const minCenterDistance =
        prev.width / 2 + config.minSiblingGap + curr.width / 2;
      const requiredX = prev.x + minCenterDistance;
      if (curr.x < requiredX) {
        shiftSubtree(layoutNodes, curr.id, requiredX - curr.x);
      }
    }
  }
}

function assignY(layoutNodes: Map<string, LayoutNode>, config: LayoutConfig) {
  const depths = Array.from(
    new Set(Array.from(layoutNodes.values()).map((n) => n.depth)),
  ).sort((a, b) => a - b);

  const maxHeightByDepth = new Map<number, number>();
  for (const d of depths) maxHeightByDepth.set(d, 0);
  for (const node of layoutNodes.values()) {
    maxHeightByDepth.set(
      node.depth,
      Math.max(maxHeightByDepth.get(node.depth) ?? 0, node.height),
    );
  }

  const topByDepth = new Map<number, number>();
  let cursorY = config.canvasPaddingY;
  for (const depth of depths) {
    topByDepth.set(depth, cursorY);
    cursorY += (maxHeightByDepth.get(depth) ?? 0) + config.layerGap;
  }

  for (const node of layoutNodes.values()) {
    const layerTop = topByDepth.get(node.depth) ?? config.canvasPaddingY;
    const layerHeight = maxHeightByDepth.get(node.depth) ?? node.height;
    node.y = layerTop + (layerHeight - node.height) / 2;
  }
}

function normalizeLayout(
  layoutNodes: Map<string, LayoutNode>,
  config: LayoutConfig,
) {
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;

  for (const node of layoutNodes.values()) {
    minLeft = Math.min(minLeft, node.x - node.width / 2);
    minTop = Math.min(minTop, node.y);
  }

  const shiftX = config.canvasPaddingX - minLeft;
  const shiftY = config.canvasPaddingY - minTop;

  for (const node of layoutNodes.values()) {
    node.x += shiftX;
    node.y += shiftY;
  }
}

function getHandlePoint(node: LayoutNode, handle: Handle) {
  const left = node.x - node.width / 2;
  const right = node.x + node.width / 2;
  const top = node.y;
  const bottom = node.y + node.height;

  switch (handle) {
    case "top":
      return { x: node.x, y: top };
    case "right":
      return { x: right, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x, y: bottom };
    case "left":
      return { x: left, y: node.y + node.height / 2 };
  }
}

function chooseHandles(
  source: LayoutNode,
  target: LayoutNode,
): { from: Handle; to: Handle } {
  // Decision split: enforce semantic left(No) and right(Yes) branches.
  if (
    source.isDecision &&
    source.outgoingCount >= 2 &&
    target.depth > source.depth
  ) {
    if (target.x < source.x) return { from: "left", to: "top" };
    return { from: "right", to: "top" };
  }

  // Merge: prefer clean top-entry convergence to keep flowchart readable.
  if (target.isMerge && source.depth < target.depth) {
    return { from: "bottom", to: "top" };
  }

  if (
    source.depth === target.depth &&
    Math.abs(source.x - target.x) > (source.width + target.width) * 1.3
  ) {
    return { from: "bottom", to: "bottom" };
  }

  if (source.depth < target.depth) return { from: "bottom", to: "top" };
  if (source.depth > target.depth) return { from: "top", to: "bottom" };
  if (source.x <= target.x) return { from: "right", to: "left" };
  return { from: "left", to: "right" };
}

function chooseArchitectureHandles(
  source: LayoutNode,
  target: LayoutNode,
): { from: Handle; to: Handle } {
  if (source.depth < target.depth) {
    return { from: "bottom", to: "top" };
  }

  if (source.depth > target.depth) {
    return { from: "top", to: "bottom" };
  }

  // For top-layer peers, route downward so edge band stays readable.
  if (source.depth === 0) {
    return source.x <= target.x
      ? { from: "bottom", to: "bottom" }
      : { from: "bottom", to: "bottom" };
  }

  if (source.x <= target.x) return { from: "right", to: "left" };
  return { from: "left", to: "right" };
}

interface HandleUsage {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function createHandleUsage(): HandleUsage {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function pickLeastUsedHandle(
  candidates: Handle[],
  usage: HandleUsage,
  fallback: Handle,
): Handle {
  let best = fallback;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate, idx) => {
    const score = usage[candidate] * 10 + idx;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}

function spreadSourceHandle(
  source: LayoutNode,
  target: LayoutNode,
  preferred: Handle,
  usage: HandleUsage,
): Handle {
  if (source.outgoingCount <= 1) return preferred;
  if (usage[preferred] === 0) return preferred;

  if (preferred === "bottom" || preferred === "top") {
    const lateralFirst: Handle[] =
      target.x < source.x
        ? ["left", "right", preferred]
        : target.x > source.x
          ? ["right", "left", preferred]
          : [preferred, "left", "right"];
    return pickLeastUsedHandle(lateralFirst, usage, preferred);
  }

  const verticalFirst: Handle[] =
    target.depth > source.depth
      ? ["bottom", preferred, "top"]
      : target.depth < source.depth
        ? ["top", preferred, "bottom"]
        : [preferred, "top", "bottom"];
  return pickLeastUsedHandle(verticalFirst, usage, preferred);
}

function spreadTargetHandle(
  source: LayoutNode,
  target: LayoutNode,
  preferred: Handle,
  usage: HandleUsage,
): Handle {
  if (target.incomingCount <= 1) return preferred;
  if (usage[preferred] === 0) return preferred;

  if (preferred === "top" || preferred === "bottom") {
    const lateralFirst: Handle[] =
      source.x < target.x
        ? ["left", "right", preferred]
        : source.x > target.x
          ? ["right", "left", preferred]
          : [preferred, "left", "right"];
    return pickLeastUsedHandle(lateralFirst, usage, preferred);
  }

  const verticalFirst: Handle[] =
    source.depth < target.depth
      ? ["top", preferred, "bottom"]
      : source.depth > target.depth
        ? ["bottom", preferred, "top"]
        : [preferred, "top", "bottom"];
  return pickLeastUsedHandle(verticalFirst, usage, preferred);
}

function mapNodeToElement(node: LayoutNode, index: number): CanvasElement {
  const style = getNodeVisualStyle(node);
  const id = generateShortId(index);

  if (node.shape === "circle") {
    const radius = node.width / 2;
    const centerX = node.x;
    const centerY = node.y + node.height / 2;
    return {
      id,
      type: "circle",
      label: node.label,
      points: [
        { x: centerX, y: centerY },
        { x: centerX + radius, y: centerY },
      ],
      fill: style.fill,
      color: style.color,
      strokeWidth: 2,
    };
  }

  return {
    id,
    type: node.shape === "diamond" ? "diamond" : "rectangle",
    label: node.label,
    points: [
      { x: node.x - node.width / 2, y: node.y },
      { x: node.x + node.width / 2, y: node.y + node.height },
    ],
    fill: style.fill,
    color: style.color,
    strokeWidth: 2,
  };
}

function toRoutingObstacle(element: CanvasElement): RoutingObstacle | null {
  if (element.isGuide) return null;
  if (element.type === "arrow" || element.type === "arrow-bidirectional") {
    return null;
  }

  if (element.type === "circle") {
    if (element.points.length < 2) return null;
    const center = element.points[0];
    const edge = element.points[1];
    const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
    return {
      id: element.id,
      bounds: {
        minX: center.x - radius,
        minY: center.y - radius,
        maxX: center.x + radius,
        maxY: center.y + radius,
      },
    };
  }

  if (
    element.type === "rectangle" ||
    element.type === "diamond" ||
    element.type === "text"
  ) {
    if (element.points.length < 2) return null;
    const first = element.points[0];
    const second = element.points[1];
    return {
      id: element.id,
      bounds: {
        minX: Math.min(first.x, second.x),
        minY: Math.min(first.y, second.y),
        maxX: Math.max(first.x, second.x),
        maxY: Math.max(first.y, second.y),
      },
    };
  }

  return null;
}

function getNodeVisualStyle(node: LayoutNode): NodeVisualStyle {
  const label = node.label.toLowerCase();
  const stroke = "#1f2937";

  const palette = {
    service: "#dbeafe",
    gateway: "#ddd6fe",
    auth: "#f5d0fe",
    compute: "#e0f2fe",
    data: "#fde68a",
    storage: "#fed7aa",
    external: "#bfdbfe",
    queue: "#bae6fd",
    monitor: "#c7d2fe",
    decision: "#fecdd3",
    defaultRectA: "#dbeafe",
    defaultRectB: "#e0e7ff",
    defaultCircle: "#fde68a",
  };

  if (node.shape === "diamond")
    return { fill: palette.decision, color: stroke };
  if (node.shape === "circle") {
    if (/(db|database|cache|redis|mongo|postgres|mysql|storage)/.test(label)) {
      return { fill: palette.data, color: stroke };
    }
    if (/(queue|broker|kafka|stream|event)/.test(label)) {
      return { fill: palette.queue, color: stroke };
    }
    return { fill: palette.defaultCircle, color: stroke };
  }

  if (/(gateway|api gateway|ingress|proxy|edge)/.test(label)) {
    return { fill: palette.gateway, color: stroke };
  }
  if (/(auth|oauth|identity|jwt|clerk)/.test(label)) {
    return { fill: palette.auth, color: stroke };
  }
  if (/(cdn|external|third party|provider|stripe|twilio|s3)/.test(label)) {
    return { fill: palette.external, color: stroke };
  }
  if (/(worker|processor|lambda|function|compute)/.test(label)) {
    return { fill: palette.compute, color: stroke };
  }
  if (/(monitor|metrics|logging|observability)/.test(label)) {
    return { fill: palette.monitor, color: stroke };
  }
  if (/(store|storage|blob)/.test(label)) {
    return { fill: palette.storage, color: stroke };
  }
  if (/(service|backend|frontend|client|server)/.test(label)) {
    return { fill: palette.service, color: stroke };
  }

  return {
    fill: node.depth % 2 === 0 ? palette.defaultRectA : palette.defaultRectB,
    color: stroke,
  };
}

function isArchitectureLayoutInvalid(
  metrics: {
    edgeCrossingRatio: number;
    hierarchyViolations: number;
    nodeOverlapCount: number;
    diagramWidth: number;
  },
  strict = true,
) {
  if (strict) {
    return (
      metrics.nodeOverlapCount > 0 ||
      metrics.hierarchyViolations > 0 ||
      metrics.edgeCrossingRatio > 0.3 ||
      metrics.diagramWidth > 2000
    );
  }
  // Relaxed thresholds — allow minor imperfections rather than rejecting entirely.
  return (
    metrics.nodeOverlapCount > 2 ||
    metrics.hierarchyViolations > 1 ||
    metrics.edgeCrossingRatio > 0.45 ||
    metrics.diagramWidth > 2800
  );
}

function createArchitectureGuides(
  layerBands: Array<{
    index: number;
    name: string;
    top: number;
    bottom: number;
    left: number;
    right: number;
  }>,
  layoutNodes: Map<string, LayoutNode>,
  startIndex: number,
) {
  let index = startIndex;
  const guides: CanvasElement[] = [];

  const layerBackgroundColors = [
    "#f0f4ff", // edge - light blue
    "#f5f3ff", // application - light purple
    "#fffbeb", // data - light amber
    "#f0fdf4", // observability - light green
  ];

  layerBands.forEach((band) => {
    // Light background strip per layer for visual grouping.
    guides.push({
      id: generateShortId(index++),
      type: "rectangle",
      points: [
        { x: band.left - 16, y: band.top - 4 },
        { x: band.right + 16, y: band.bottom + 4 },
      ],
      fill: layerBackgroundColors[band.index % layerBackgroundColors.length],
      color: "#e2e8f0",
      strokeWidth: 1,
      isGuide: true,
    });

    guides.push({
      id: generateShortId(index++),
      type: "line",
      points: [
        { x: band.left, y: band.top + 2 },
        { x: band.right, y: band.top + 2 },
      ],
      color: "#dbe4f0",
      strokeWidth: 1,
      isGuide: true,
    });

    guides.push({
      id: generateShortId(index++),
      type: "text",
      text: band.name[0].toUpperCase() + band.name.slice(1),
      points: [{ x: band.left + 12, y: band.top + 10 }],
      color: "#475569",
      strokeWidth: 1,
      fontSize: 18,
      fontWeight: "700",
      isGuide: true,
    });
  });

  const clusters: Array<{
    label: string;
    match: (node: LayoutNode) => boolean;
  }> = [
    {
      label: "Order Domain",
      match: (node) =>
        /(order|cart|catalog|inventory|product)/i.test(node.label),
    },
    {
      label: "Payment Domain",
      match: (node) => /(payment|billing|invoice|checkout)/i.test(node.label),
    },
    {
      label: "Observability Cluster",
      match: (node) =>
        /(monitor|metrics|logging|trace|alert|analytics|audit)/i.test(
          node.label,
        ),
    },
  ];

  clusters.forEach((cluster) => {
    const members = Array.from(layoutNodes.values()).filter(cluster.match);
    if (members.length < 2) return;
    const minX = Math.min(...members.map((node) => node.x - node.width / 2));
    const minY = Math.min(...members.map((node) => node.y));

    guides.push({
      id: generateShortId(index++),
      type: "text",
      text: cluster.label,
      points: [{ x: minX - 8, y: minY - 20 }],
      color: "#64748b",
      strokeWidth: 1,
      fontSize: 14,
      fontWeight: "600",
      isGuide: true,
    });
  });

  return { guides, nextIndex: index };
}

function buildNodeAndArrowElementsFromLayout(
  graph: LogicalGraph,
  layoutNodes: Map<string, LayoutNode>,
  depth: Map<string, number>,
  handleChooser: (
    source: LayoutNode,
    target: LayoutNode,
  ) => {
    from: Handle;
    to: Handle;
  },
  options?: {
    verticalBias?: boolean;
    obstaclePadding?: number;
    parallelSpacing?: number;
    layerBoundaryYs?: number[];
  },
): { elements: CanvasElement[]; nextIndex: number } {
  const elements: CanvasElement[] = [];
  const nodeElementByLogicalId = new Map<string, CanvasElement>();

  let index = 0;
  for (const node of graph.nodes) {
    const layoutNode = layoutNodes.get(node.id);
    if (!layoutNode) continue;
    const element = mapNodeToElement(layoutNode, index++);
    elements.push(element);
    nodeElementByLogicalId.set(node.id, element);
  }

  const edgesByKey = new Map<string, LogicalEdge>();
  const consumedDirectionalEdges = new Set<string>();
  const sourceHandleUsageByNodeId = new Map<string, HandleUsage>();
  const targetHandleUsageByNodeId = new Map<string, HandleUsage>();
  const arrowDrafts: Array<
    Omit<
      CanvasElement,
      | "type"
      | "points"
      | "color"
      | "strokeWidth"
      | "routingMode"
      | "routePreference"
      | "isManuallyRouted"
      | "arrowHeadStart"
      | "arrowHeadEnd"
      | "dashed"
      | "startConnection"
      | "endConnection"
    > & {
      id: string;
      isBidirectional: boolean;
      isDashed: boolean;
      sourceElement: CanvasElement;
      targetElement: CanvasElement;
      fromHandle: Handle;
      toHandle: Handle;
      routingDescriptor: RouteArrowDescriptor;
    }
  > = [];

  graph.edges.forEach((edge) => {
    edgesByKey.set(`${edge.from}->${edge.to}`, edge);
  });

  for (const edge of graph.edges) {
    const forwardKey = `${edge.from}->${edge.to}`;
    if (consumedDirectionalEdges.has(forwardKey)) continue;

    const reverseKey = `${edge.to}->${edge.from}`;
    const reverseEdge = edgesByKey.get(reverseKey);
    const isBidirectional = Boolean(
      edge.bidirectional || reverseEdge?.bidirectional || reverseEdge,
    );
    const isDashed = Boolean(edge.dashed || reverseEdge?.dashed);

    consumedDirectionalEdges.add(forwardKey);
    if (isBidirectional) {
      consumedDirectionalEdges.add(reverseKey);
    }

    let renderFrom = edge.from;
    let renderTo = edge.to;

    const fromDepth = depth.get(renderFrom) ?? 0;
    const toDepth = depth.get(renderTo) ?? 0;
    const fromLayoutForDirection = layoutNodes.get(renderFrom);
    const toLayoutForDirection = layoutNodes.get(renderTo);
    if (
      isBidirectional &&
      fromLayoutForDirection &&
      toLayoutForDirection &&
      (fromDepth > toDepth ||
        (fromDepth === toDepth &&
          fromLayoutForDirection.x > toLayoutForDirection.x))
    ) {
      renderFrom = edge.to;
      renderTo = edge.from;
    }

    const sourceLayout = layoutNodes.get(renderFrom);
    const targetLayout = layoutNodes.get(renderTo);
    const sourceElement = nodeElementByLogicalId.get(renderFrom);
    const targetElement = nodeElementByLogicalId.get(renderTo);
    if (!sourceLayout || !targetLayout || !sourceElement || !targetElement) {
      continue;
    }

    const baseHandles = handleChooser(sourceLayout, targetLayout);
    const sourceUsage =
      sourceHandleUsageByNodeId.get(renderFrom) ?? createHandleUsage();
    const targetUsage =
      targetHandleUsageByNodeId.get(renderTo) ?? createHandleUsage();
    sourceHandleUsageByNodeId.set(renderFrom, sourceUsage);
    targetHandleUsageByNodeId.set(renderTo, targetUsage);

    const fromHandle = spreadSourceHandle(
      sourceLayout,
      targetLayout,
      baseHandles.from,
      sourceUsage,
    );
    const toHandle = spreadTargetHandle(
      sourceLayout,
      targetLayout,
      baseHandles.to,
      targetUsage,
    );
    sourceUsage[fromHandle] += 1;
    targetUsage[toHandle] += 1;

    const routePreference =
      options?.verticalBias && sourceLayout.depth !== targetLayout.depth
        ? "vh"
        : fromHandle === "left" || fromHandle === "right"
          ? "hv"
          : "vh";

    const arrowId = generateShortId(index++);
    arrowDrafts.push({
      id: arrowId,
      isBidirectional,
      isDashed,
      sourceElement,
      targetElement,
      fromHandle,
      toHandle,
      routingDescriptor: {
        arrowId,
        start: getHandlePoint(sourceLayout, fromHandle),
        end: getHandlePoint(targetLayout, toHandle),
        startHandle: fromHandle,
        endHandle: toHandle,
        routingMode: "orthogonal",
        routePreference,
        sourceId: sourceElement.id,
        targetId: targetElement.id,
      },
    });
  }

  const obstacles = elements
    .map((element) => toRoutingObstacle(element))
    .filter((obstacle): obstacle is RoutingObstacle => obstacle !== null);
  const routedArrowPoints = routeArrowBatch({
    arrows: arrowDrafts.map((draft) => draft.routingDescriptor),
    obstacles,
    obstaclePadding: options?.obstaclePadding ?? 18,
    parallelSpacing: options?.parallelSpacing ?? 14,
    pathRanking: {
      bendPenalty: 960,
      lengthPenalty: 1,
      detourPenalty: 0.18,
      preferencePenalty: 56,
      crossingPenalty: 1700,
    },
    layerBoundaryYs: options?.layerBoundaryYs,
  });

  arrowDrafts.forEach((draft) => {
    const points = routedArrowPoints.get(draft.id) ?? [
      draft.routingDescriptor.start,
      draft.routingDescriptor.end,
    ];
    elements.push({
      id: draft.id,
      type: draft.isBidirectional ? "arrow-bidirectional" : "arrow",
      points,
      color: "#64748b",
      strokeWidth: 2,
      dashed: draft.isDashed,
      arrowHeadStart: draft.isBidirectional,
      arrowHeadEnd: true,
      routingMode: "orthogonal",
      routePreference: draft.routingDescriptor.routePreference,
      isManuallyRouted: false,
      startConnection: {
        elementId: draft.sourceElement.id,
        anchorId: buildAnchorId(draft.sourceElement.id, draft.fromHandle),
      },
      endConnection: {
        elementId: draft.targetElement.id,
        anchorId: buildAnchorId(draft.targetElement.id, draft.toHandle),
      },
    });
  });

  return { elements, nextIndex: index };
}

function buildArchitectureElements(graph: LogicalGraph): CanvasElement[] {
  if (graph.nodes.length === 0) return [];

  const sizingConfig = createLayoutConfig(graph, 3, "architecture");
  const layoutInputNodes = graph.nodes.map((node) => {
    let width = estimateRectangleWidth(node.label, sizingConfig.rectangleWidth);
    let height = sizingConfig.rectangleHeight;
    if (node.shape === "circle") {
      width = estimateCircleDiameter(node.label, sizingConfig.circleDiameter);
      height = width;
    } else if (node.shape === "diamond") {
      width = estimateDiamondSize(node.label, sizingConfig.diamondSize);
      height = width;
    }
    return {
      id: node.id,
      label: node.label,
      shape: node.shape,
      width,
      height,
      layerHint: node.layer,
      columnHint: node.column,
    };
  });

  const layoutEdges = graph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
  }));
  let layout = computeArchitectureLayeredLayout({
    nodes: layoutInputNodes,
    edges: layoutEdges,
    options: {
      centerX: 980,
      topY: 180,
      layerGap: clamp(210 - graph.nodes.length, 150, 210),
      maxDiagramWidth: 1500,
      minHorizontalGap: 96,
      maxHorizontalGap: 188,
      orderingPasses: 4,
    },
  });

  // Pass 2: Slightly relaxed parameters.
  if (isArchitectureLayoutInvalid(layout.metrics)) {
    layout = computeArchitectureLayeredLayout({
      nodes: layoutInputNodes,
      edges: layoutEdges,
      options: {
        centerX: 980,
        topY: 180,
        layerGap: 220,
        maxDiagramWidth: 1680,
        minHorizontalGap: 108,
        maxHorizontalGap: 204,
        orderingPasses: 5,
      },
    });
  }

  // Pass 3: Even more relaxed — wider canvas, more passes.
  if (isArchitectureLayoutInvalid(layout.metrics)) {
    layout = computeArchitectureLayeredLayout({
      nodes: layoutInputNodes,
      edges: layoutEdges,
      options: {
        centerX: 980,
        topY: 180,
        layerGap: 240,
        maxDiagramWidth: 2200,
        minHorizontalGap: 120,
        maxHorizontalGap: 240,
        orderingPasses: 6,
      },
    });
  }

  // Pass 4: Apply relaxed quality gates — accept minor imperfections.
  if (isArchitectureLayoutInvalid(layout.metrics, false)) {
    console.warn(
      `Architecture layout has imperfections (overlap=${layout.metrics.nodeOverlapCount}, hierarchy=${layout.metrics.hierarchyViolations}, crossingRatio=${layout.metrics.edgeCrossingRatio.toFixed(2)}, width=${layout.metrics.diagramWidth.toFixed(0)}) — proceeding with best effort.`,
    );
  }

  const { incoming, outgoing } = buildAdjacency(graph);
  const depth = new Map<string, number>();
  const layoutNodes = new Map<string, LayoutNode>();

  layoutInputNodes.forEach((node) => {
    const positioned = layout.nodes.get(node.id);
    if (!positioned) return;
    depth.set(node.id, positioned.layer);
    layoutNodes.set(node.id, {
      id: node.id,
      label: node.label,
      shape: node.shape,
      width: node.width,
      height: node.height,
      depth: positioned.layer,
      x: positioned.x,
      y: positioned.y,
      parentId: null,
      children: [],
      incomingCount: incoming.get(node.id)?.length ?? 0,
      outgoingCount: outgoing.get(node.id)?.length ?? 0,
      isDecision: node.shape === "diamond",
      isMerge: (incoming.get(node.id)?.length ?? 0) > 1,
    });
  });

  // Extract layer boundary Y-coordinates for layer-aware routing.
  const layerBoundaryYs = layout.layers.map((layer) => layer.top);

  const rendered = buildNodeAndArrowElementsFromLayout(
    graph,
    layoutNodes,
    depth,
    chooseArchitectureHandles,
    {
      verticalBias: true,
      obstaclePadding: 22,
      parallelSpacing: 14,
      layerBoundaryYs,
    },
  );

  const { guides } = createArchitectureGuides(
    layout.layers,
    layoutNodes,
    rendered.nextIndex,
  );
  return [...guides, ...rendered.elements];
}

function buildElements(
  graph: LogicalGraph,
  intent: DiagramIntent,
): CanvasElement[] {
  if (graph.nodes.length === 0) return [];
  if (intent === "architecture") {
    return buildArchitectureElements(graph);
  }

  const { incoming, outgoing } = buildAdjacency(graph);
  const depth = applyDepthBiasByIntent(graph, computeNodeDepths(graph), intent);
  const maxDepth = Math.max(...Array.from(depth.values(), (v) => v ?? 0), 0);
  const parentOf = pickPrimaryParents(graph, depth, incoming);
  const config = createLayoutConfig(graph, maxDepth, intent);

  const layoutNodes = createInitialLayoutNodes(
    graph,
    depth,
    parentOf,
    incoming,
    outgoing,
    config,
  );

  placeForest(layoutNodes, config);
  optimizeLayerOrdering(layoutNodes, incoming, outgoing, config);
  applyDecisionAndMergeAlignment(
    layoutNodes,
    outgoing,
    incoming,
    depth,
    config,
  );
  recenterParents(layoutNodes);
  resolveHorizontalCollisions(layoutNodes, config);
  recenterParents(layoutNodes);
  assignY(layoutNodes, config);
  normalizeLayout(layoutNodes, config);

  return buildNodeAndArrowElementsFromLayout(
    graph,
    layoutNodes,
    depth,
    chooseHandles,
    {
      verticalBias: false,
      obstaclePadding: 18,
      parallelSpacing: 14,
    },
  ).elements;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const intent = detectDiagramIntent(prompt);
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(intent) },
        {
          role: "user",
          content: buildUserPrompt(prompt, intent),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("Invalid JSON from AI");
    }

    const parsed = JSON.parse(
      cleaned.slice(jsonStart, jsonEnd + 1),
    ) as DiagramJson;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new Error("Invalid nodes/edges format");
    }

    const logicalGraph = simplifyGraphForReadability(
      keepMostRelevantComponent(sanitizeGraph(parsed, intent, prompt), prompt),
      intent,
    );
    const elements = buildElements(logicalGraph, intent);

    return NextResponse.json({ elements });
  } catch (error) {
    console.error("generate-diagram error:", error);
    if (
      error instanceof Error &&
      error.message.includes("rejected by quality gates")
    ) {
      return NextResponse.json(
        {
          error:
            "Generated diagram was rejected by layout quality gates. Try a narrower scope or fewer cross-domain links.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Failed to generate diagram." },
      { status: 500 },
    );
  }
}

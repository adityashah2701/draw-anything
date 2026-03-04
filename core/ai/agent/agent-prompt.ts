/**
 * core/ai/agent/agent-prompt.ts
 *
 * Prompt builders for the agentic Groq loop.
 *
 * Key differences from the original single-shot prompts:
 * - Instructs Groq to CALL TOOLS instead of emitting JSON.
 * - Sends a compressed graph digest (IDs + labels only) on the first turn.
 * - Subsequent turns receive a structural diff, not the full graph.
 * - Strictly forbids emitting any geometry fields.
 */

import type { AgentGraph, GraphDiff } from "@/core/ai/types";

// ─── System prompts ───────────────────────────────────────────────────────────

/**
 * Builds the system prompt for the agentic update loop.
 * These instructions govern HOW the agent interacts — via tool calls.
 */
export function buildAgentSystemPrompt(
  graphDigest: string,
  intent: "architecture" | "flowchart" | "concept",
  focusedNodeId?: string,
): string {
  const intentRules =
    intent === "architecture"
      ? `
Architecture-specific rules:
- Every node must belong to a layer: edge, application, data, or observability.
- Keep each layer to at most 5 nodes for readability.
- Prefer vertical dependencies (inter-layer edges). Minimise same-layer edges.
- Databases, caches, and queues → shape "circle", layer "data".
- API gateways → shape "rectangle", layer "edge".
- Services → shape "rectangle", layer "application".
- Monitoring tools → layer "observability".`
      : intent === "flowchart"
        ? `
Flowchart-specific rules:
- Use shape "diamond" only for conditional branching/decision points.
- Nodes should form a clear directional flow (source → sink).
- Avoid all-to-all connections.`
        : `
Concept-specific rules:
- Model entities and relationships. No process steps unless requested.
- Prefer sparse connections for readability.`;

  const focusSection = focusedNodeId
    ? `
FOCUSED ELEMENT: The user has selected node with id="${focusedNodeId}".
All operations should target this node UNLESS the user explicitly mentions another node.
Supported focused operations:
  - Change fill color     → updateNode("${focusedNodeId}", { fill: "..." })
  - Change text color     → updateNode("${focusedNodeId}", { color: "..." })
  - Rename label          → updateNode("${focusedNodeId}", { label: "..." })
  - Add a node above it   → createNode + createEdge(newNodeId → "${focusedNodeId}")
  - Add a node below it   → createNode + createEdge("${focusedNodeId}" → newNodeId)
  - Connect to another    → createEdge("${focusedNodeId}" ↔ targetNodeId)
  - Reposition (arch)     → updateNode("${focusedNodeId}", { layer: "...", column: N })
  - Delete it             → deleteNode("${focusedNodeId}") — only if user explicitly says so.
`
    : "";

  return `You are an expert diagram editor with access to graph mutation tools.

CRITICAL RULES — read carefully:
1. You MUST use the provided tools to modify the diagram. NEVER emit JSON directly.
2. You MUST call the "finish" tool when you are done. Do not stop without calling it.
3. NEVER include any visual geometry (x, y, width, height, points, coordinates).
4. Keep all labels concise: 1–4 words maximum.
5. Only make changes that are explicitly requested or strongly implied.
6. Do not remove existing nodes/edges unless the user explicitly asks to.
7. Preserve the existing structure; make surgical, minimal changes.
8. If a tool call returns an error, read the error message and self-correct.
9. COLORS — two separate fields, do NOT confuse them:
   - "fill" = BACKGROUND color of the node shape.
     Use when user says: "make it red", "color the node green", "background color", "fill color".
     Semantic defaults: success/yes/pass → "#22c55e"; error/no/fail → "#ef4444"; warning → "#f97316".
   - "color" = TEXT/LABEL color inside the node.
     Use when user says: "text color", "label color", "font color", "make the text white".
     Both fields can be set together: e.g. red background + white text → fill="#ef4444" + color="#ffffff".
   - IMPORTANT: When the user says "text color", ONLY set "color". Do NOT touch "fill".
   - IMPORTANT: When the user says "background" or "fill color", ONLY set "fill". Do NOT touch "color".
   - Do NOT set either field unless the user explicitly requests a color change.
   - Existing fill/color values are preserved between updates — only change what is explicitly requested.
${focusSection}
CURRENT GRAPH STATE:
${graphDigest}
${intentRules}`;
}

/**
 * Builds the user message for the first iteration.
 */
export function buildAgentUserMessage(
  userPrompt: string,
  intent: "architecture" | "flowchart" | "concept",
  focusedNodeId?: string,
): string {
  const focusHint = focusedNodeId
    ? `\nThe user has selected node "${focusedNodeId}" — apply the request to this node unless instructed otherwise.`
    : "";
  return `User request: "${userPrompt}"\n\nDiagram type: ${intent}${focusHint}\n\nInstructions:\n- Call the appropriate tools to make the requested changes.\n- Use only tool calls — do not write text explanations.\n- When finished making all changes, call the "finish" tool with a summary.`;
}

/**
 * Builds a retry message when Groq produces text instead of tool calls.
 * Sent once before giving up on that iteration.
 */
export function buildRetryMessage(): string {
  return (
    "You must use tool calls to modify the diagram. " +
    "Please call the appropriate tools now. " +
    "When done, call the 'finish' tool."
  );
}

// ─── Graph digest (first turn) ────────────────────────────────────────────────

/**
 * Produces a compact, token-efficient summary of the graph for the first turn.
 * Format: IDs + labels + edges — no geometry, no visual attributes.
 */
export function buildGraphDigest(graph: AgentGraph): string {
  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = Object.keys(graph.edges).length;

  if (nodeCount === 0) {
    return "Graph is currently EMPTY. You will be creating a new diagram from scratch.";
  }

  const nodeLines = Object.values(graph.nodes)
    .map((n) => {
      const layerPart = n.layer ? ` [${n.layer}]` : "";
      return `  - ${n.id}: "${n.label}" (${n.shape}${layerPart})`;
    })
    .join("\n");

  const edgeLines = Object.values(graph.edges)
    .map((e) => {
      const attrs: string[] = [`edgeId="${e.edgeId}"`];
      if (e.bidirectional) attrs.push("bidirectional");
      if (e.dashed) attrs.push("dashed");
      return `  - ${e.from} → ${e.to} (${attrs.join(", ")})`;
    })
    .join("\n");

  return [
    `Nodes (${nodeCount}):`,
    nodeLines,
    ``,
    `Edges (${edgeCount}):`,
    edgeLines,
  ].join("\n");
}

// ─── Diff summary (subsequent turns) ─────────────────────────────────────────

/**
 * Formats a GraphDiff as a compact system message for subsequent iterations.
 * This replaces sending the full graph on every turn.
 */
export function buildDiffSummary(diff: GraphDiff): string | null {
  const lines: string[] = [];

  if (diff.added.nodes.length > 0) {
    lines.push(
      `Added nodes: ${diff.added.nodes.map((n) => `${n.id} ("${n.label}")`).join(", ")}`,
    );
  }
  if (diff.added.edges.length > 0) {
    lines.push(
      `Added edges: ${diff.added.edges.map((e) => `${e.edgeId}:${e.from}→${e.to}`).join(", ")}`,
    );
  }
  if (diff.removed.nodeIds.length > 0) {
    lines.push(`Removed nodes: ${diff.removed.nodeIds.join(", ")}`);
  }
  if (diff.removed.edgeIds.length > 0) {
    lines.push(`Removed edges: ${diff.removed.edgeIds.join(", ")}`);
  }
  if (diff.updated.length > 0) {
    lines.push(
      `Updated nodes: ${diff.updated.map((n) => `${n.id} ("${n.label}")`).join(", ")}`,
    );
  }

  if (lines.length === 0) return null;

  return `[Graph updated]\n${lines.join("\n")}`;
}

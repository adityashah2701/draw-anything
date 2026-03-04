/**
 * core/validation/graph-validator.ts
 *
 * Structural integrity scanner for AgentGraph.
 *
 * This runs ONCE at the end of the agent workflow loop (not per iteration).
 * Per-mutation pre-checks live in GraphStore itself.
 *
 * The report is included in the API response metadata and can be used for
 * monitoring/logging. It is NOT sent back to Groq mid-loop.
 */

import type { AgentGraph } from "@/core/ai/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  kind:
    | "orphan_node"
    | "invalid_edge_ref"
    | "excessive_connections"
    | "self_loop";
  nodeId?: string;
  edgeId?: string;
  detail: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  summary: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_DEGREE = 8; // nodes with more edges than this are flagged

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Runs an O(n + e) structural validation sweep on the graph.
 * Returns a ValidationReport describing any issues found.
 */
export function validateGraph(graph: AgentGraph): ValidationReport {
  const issues: ValidationIssue[] = [];

  const nodeIds = new Set(Object.keys(graph.nodes));
  const degree = new Map<string, number>();

  // Initialise degree counter
  for (const id of nodeIds) {
    degree.set(id, 0);
  }

  // Validate edges
  for (const [edgeId, edge] of Object.entries(graph.edges)) {
    // Check referential integrity
    if (!nodeIds.has(edge.from)) {
      issues.push({
        kind: "invalid_edge_ref",
        edgeId,
        detail: `Edge "${edgeId}" references non-existent source node "${edge.from}".`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        kind: "invalid_edge_ref",
        edgeId,
        detail: `Edge "${edgeId}" references non-existent target node "${edge.to}".`,
      });
    }

    // Self-loop check (should have been caught by GraphStore, but double-check)
    if (edge.from === edge.to) {
      issues.push({
        kind: "self_loop",
        edgeId,
        detail: `Edge "${edgeId}" is a self-loop on node "${edge.from}".`,
      });
    }

    // Degree tracking (only for valid nodes)
    if (nodeIds.has(edge.from)) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    }
    if (nodeIds.has(edge.to)) {
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
  }

  // Check for orphan nodes (zero degree)
  for (const [nodeId, deg] of degree) {
    if (deg === 0 && Object.keys(graph.nodes).length > 1) {
      issues.push({
        kind: "orphan_node",
        nodeId,
        detail: `Node "${nodeId}" (${graph.nodes[nodeId]?.label ?? "?"}) has no edges.`,
      });
    }

    // Excessive connections
    if (deg > MAX_DEGREE) {
      issues.push({
        kind: "excessive_connections",
        nodeId,
        detail: `Node "${nodeId}" has ${deg} connections (max recommended: ${MAX_DEGREE}).`,
      });
    }
  }

  const valid = issues.length === 0;
  const summary = valid
    ? "Graph is structurally valid."
    : `Found ${issues.length} issue(s): ${issues.map((i) => i.kind).join(", ")}.`;

  return { valid, issues, summary };
}

/**
 * Returns a compact string report suitable for logging or
 * including in API response metadata (not for Groq consumption).
 */
export function formatValidationReport(report: ValidationReport): string {
  if (report.valid) return report.summary;

  return [
    report.summary,
    ...report.issues.map(
      (issue, i) => `  ${i + 1}. [${issue.kind}] ${issue.detail}`,
    ),
  ].join("\n");
}

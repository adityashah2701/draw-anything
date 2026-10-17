import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { measureLayout, type LayoutMetrics } from "@/features/ai/server/layout/metrics";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import type { DiagramCodeIssue, ParsedDiagramCode } from "@/features/diagram-code/types";
import { lintDiagram, type LintFinding } from "./lint";

/** Tool input bound: a model cannot make the check expensive. */
const MAX_CHECK_CHARS = 20_000;
const MAX_REPORT_CHARS = 1_500;

export interface CheckReport {
  /** Parses with no errors (warnings and advice do not make it not-ok). */
  ok: boolean;
  errors: DiagramCodeIssue[];
  warnings: DiagramCodeIssue[];
  advice: LintFinding[];
  metrics?: Pick<LayoutMetrics, "nodes" | "edges" | "edgeCrossings" | "longestEdge" | "labelsColliding" | "groupsDropped" | "nodeOverlaps">;
  parsed: ParsedDiagramCode;
  /** The compact text the model reads. */
  text: string;
}

const formatIssue = (i: DiagramCodeIssue) => `line ${i.line}: ${i.message}`;

/**
 * parse -> (if it parses) lay out -> measure -> review. The model sees what the picture will be
 * (crossings, longest connector) before it commits, not after.
 */
export const checkDiagram = (code: string): CheckReport => {
  const source = code.length > MAX_CHECK_CHARS ? code.slice(0, MAX_CHECK_CHARS) : code;
  const parsed = parseDiagramCode(source);
  const errors = parsed.issues.filter((i) => i.severity === "error");
  const warnings = parsed.issues.filter((i) => i.severity === "warning");

  let metrics: CheckReport["metrics"];
  let advice: LintFinding[];
  if (errors.length === 0 && parsed.nodes.length > 0) {
    try {
      const { document } = documentFromParsedCode(parsed, "check");
      const result = compileAIDiagramDetailed(document, "check");
      const m = measureLayout(result.elements, document.groups);
      metrics = {
        nodes: m.nodes,
        edges: m.edges,
        edgeCrossings: m.edgeCrossings,
        longestEdge: m.longestEdge,
        labelsColliding: m.labelsColliding,
        groupsDropped: m.groupsDropped,
        nodeOverlaps: m.nodeOverlaps,
      };
      advice = lintDiagram(parsed, metrics);
    } catch {
      advice = [...lintDiagram(parsed), { rule: "layout-failed", advice: "The layout engine could not place this diagram; simplify it." }];
    }
  } else {
    advice = lintDiagram(parsed);
  }

  const lines: string[] = [];
  if (errors.length > 0) lines.push(`ERRORS (fix these first):`, ...errors.slice(0, 8).map((e) => `- ${formatIssue(e)}`));
  if (warnings.length > 0) lines.push(`Warnings:`, ...warnings.slice(0, 5).map((w) => `- ${formatIssue(w)}`));
  if (metrics) {
    lines.push(`Layout: ${metrics.nodes} nodes, ${metrics.edges} connections, ${metrics.edgeCrossings} crossings, longest connector ${metrics.longestEdge}px, ${metrics.labelsColliding} label collisions.`);
  }
  if (advice.length > 0) lines.push(`Design review:`, ...advice.slice(0, 6).map((a) => `- ${a.advice}`));
  if (errors.length === 0 && advice.length === 0) lines.push("No problems found. Call finish when you are satisfied.");

  let text = lines.join("\n");
  if (text.length > MAX_REPORT_CHARS) text = `${text.slice(0, MAX_REPORT_CHARS - 1)}…`;
  return { ok: errors.length === 0 && parsed.nodes.length > 0, errors, warnings, advice, metrics, parsed, text };
};

import { iconForNode } from "@/core/icons/registry";
import { measureLayout } from "@/features/ai/server/layout/metrics";
import type { AIDiagramDocumentV1 } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { GoldenPrompt } from "./golden-prompts";

export interface Score {
  nodes: number;
  inRange: boolean;
  orphans: number;
  /** Share of nodes whose icon is not the generic block. */
  iconCoverage: number;
  crossings: number;
  longestEdge: number;
  labelCollisions: number;
  groups: number;
  groupsDropped: number;
  /** Share of the expected words found in node labels. */
  mentionCoverage: number;
  /** Quality gate: drew something, no overlapping nodes, no dropped groups, no through-node connectors. */
  clean: boolean;
}

/** Scores a finished diagram, whichever pipeline produced it. Pure. */
export const scoreDiagram = (document: AIDiagramDocumentV1, elements: DrawingElement[], golden?: GoldenPrompt): Score => {
  const metrics = measureLayout(elements, document.groups);
  const degree = new Map<string, number>(document.nodes.map((n) => [n.id, 0]));
  for (const e of document.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const orphans = document.nodes.length > 1 ? [...degree.values()].filter((d) => d === 0).length : 0;

  const nodeEls = elements.filter((el) => el.ai?.role === "node");
  const iconed = nodeEls.filter((el) => iconForNode(el.ai).id !== "generic").length;
  const labelText = document.nodes.map((n) => n.label.toLowerCase()).join(" | ");
  const mentions = golden?.mentions ?? [];
  const found = mentions.filter((w) => labelText.includes(w.toLowerCase())).length;

  return {
    nodes: document.nodes.length,
    inRange: golden ? document.nodes.length >= golden.nodes[0] && document.nodes.length <= golden.nodes[1] : true,
    orphans,
    iconCoverage: nodeEls.length > 0 ? iconed / nodeEls.length : 0,
    crossings: metrics.edgeCrossings,
    longestEdge: metrics.longestEdge,
    labelCollisions: metrics.labelsColliding,
    groups: document.groups.length,
    groupsDropped: metrics.groupsDropped,
    mentionCoverage: mentions.length > 0 ? found / mentions.length : 1,
    clean: nodeEls.length > 0 && metrics.nodeOverlaps === 0 && metrics.groupsDropped === 0 && metrics.edgeThroughNodes === 0,
  };
};

export interface EvalRow {
  pipeline: string;
  prompt: string;
  ms: number;
  error?: string;
  score?: Score;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** One markdown table per pipeline plus a summary line, for the report file. */
export const renderEvalReport = (rows: EvalRow[], meta: { date: string; note?: string }): string => {
  const pipelines = [...new Set(rows.map((r) => r.pipeline))];
  const out = [`# AI diagram evaluation (${meta.date})`, "", meta.note ?? "", "## Summary", "", "| pipeline | runs | failed | clean | icon coverage | in range | crossings (mean) | longest edge (mean px) | label collisions (mean) | mentions | ms (mean) |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const p of pipelines) {
    const mine = rows.filter((r) => r.pipeline === p);
    const ok = mine.filter((r) => r.score);
    const s = ok.map((r) => r.score!);
    out.push(
      `| ${p} | ${mine.length} | ${mine.length - ok.length} | ${pct(mean(s.map((x) => (x.clean ? 1 : 0))))} | ${pct(mean(s.map((x) => x.iconCoverage)))} | ${pct(mean(s.map((x) => (x.inRange ? 1 : 0))))} | ${mean(s.map((x) => x.crossings)).toFixed(1)} | ${Math.round(mean(s.map((x) => x.longestEdge)))} | ${mean(s.map((x) => x.labelCollisions)).toFixed(1)} | ${pct(mean(s.map((x) => x.mentionCoverage)))} | ${Math.round(mean(mine.map((r) => r.ms)))} |`,
    );
  }
  out.push("", "## Runs", "", "| pipeline | prompt | nodes | clean | icons | crossings | longest | collisions | groups dropped | error |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const s = r.score;
    out.push(`| ${r.pipeline} | ${r.prompt} | ${s?.nodes ?? "-"} | ${s ? (s.clean ? "yes" : "no") : "-"} | ${s ? pct(s.iconCoverage) : "-"} | ${s?.crossings ?? "-"} | ${s?.longestEdge ?? "-"} | ${s?.labelCollisions ?? "-"} | ${s?.groupsDropped ?? "-"} | ${(r.error ?? "").replace(/\|/g, "/").slice(0, 80)} |`);
  }
  return out.join("\n") + "\n";
};

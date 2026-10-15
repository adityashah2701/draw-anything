import { describe, expect, it } from "vitest";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { createEstimateContext } from "@/core/text/estimate";
import { getShapeLabelRegion } from "@/core/text/label-region";
import { layoutShapeLabel } from "@/core/text/label-layout";
import { LAYOUT_FIXTURES } from "./index";

const entries = Object.entries(LAYOUT_FIXTURES);
const outDegree = (doc: (typeof entries)[number][1]) => {
  const counts = new Map<string, number>();
  doc.edges.forEach((e) => counts.set(e.from, (counts.get(e.from) ?? 0) + 1));
  return Math.max(0, ...counts.values());
};

describe("layout fixtures are well-formed", () => {
  it.each(entries)("%s: unique ids, valid references, no orphans", (_name, doc) => {
    const ids = doc.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(ids);
    doc.edges.forEach((e) => {
      expect(known.has(e.from), `edge from ${e.from}`).toBe(true);
      expect(known.has(e.to), `edge to ${e.to}`).toBe(true);
    });
    doc.groups.forEach((g) => g.nodeIds.forEach((id) => expect(known.has(id), `group member ${id}`).toBe(true)));
    const touched = new Set(doc.edges.flatMap((e) => [e.from, e.to]));
    expect(ids.filter((id) => !touched.has(id))).toEqual([]);
  });

  it.each(entries)("%s: compiles to one node per node and one arrow per edge", (_name, doc) => {
    const elements = compileAIDiagramToCanvas(doc, "frame-fixture");
    expect(elements.filter((e) => e.type === "semantic-node")).toHaveLength(doc.nodes.length);
    expect(elements.filter((e) => e.type === "arrow")).toHaveLength(doc.edges.length);
  });
});

describe("layout fixtures cover what Sub-project B needs to measure", () => {
  const { architecture, flowchart, "mind-map": mindMap } = LAYOUT_FIXTURES;
  const multiline = (doc: typeof architecture) => doc.nodes.filter((n) => n.label.includes("\n"));
  const long = (doc: typeof architecture) => doc.nodes.filter((n) => n.label.length > 40);

  it("architecture: layers, groups, branching, many kinds, edge labels, multiline and long names", () => {
    expect(new Set(architecture.nodes.map((n) => n.layer)).size).toBeGreaterThanOrEqual(4);
    expect(architecture.groups.length).toBeGreaterThanOrEqual(2);
    expect(outDegree(architecture)).toBeGreaterThanOrEqual(4);
    expect(new Set(architecture.nodes.map((n) => n.kind)).size).toBeGreaterThanOrEqual(10);
    expect(architecture.edges.filter((e) => e.label).length).toBeGreaterThanOrEqual(8);
    expect(multiline(architecture).length).toBeGreaterThanOrEqual(1);
    expect(long(architecture).length).toBeGreaterThanOrEqual(1);
    expect(architecture.edges.some((e) => e.dashed)).toBe(true);
  });

  it("flowchart: decisions with yes/no branches, a retry cycle, multiline and long labels", () => {
    const decisions = flowchart.nodes.filter((n) => n.kind === "decision");
    expect(decisions.length).toBeGreaterThanOrEqual(3);
    decisions.forEach((d) => expect(flowchart.edges.filter((e) => e.from === d.id).length).toBeGreaterThanOrEqual(2));
    expect(flowchart.edges.some((e) => e.label === "yes") && flowchart.edges.some((e) => e.label === "no")).toBe(true);
    expect(flowchart.edges.some((e) => e.to === "submit" && e.from !== "start")).toBe(true); // back edge
    expect(multiline(flowchart).length).toBeGreaterThanOrEqual(1);
    expect(long(flowchart).length).toBeGreaterThanOrEqual(1);
  });

  it("mind map: one root, wide fan-out, 20+ nodes, mixed label lengths", () => {
    expect(mindMap.nodes.length).toBeGreaterThanOrEqual(20);
    expect(outDegree(mindMap)).toBeGreaterThanOrEqual(5);
    expect(mindMap.edges.every((e) => !e.label)).toBe(true);
    const lengths = mindMap.nodes.map((n) => n.label.length);
    expect(Math.max(...lengths)).toBeGreaterThan(25);
    expect(Math.min(...lengths)).toBeLessThan(12);
    expect(mindMap.layoutHints.direction).toBe("radial");
  });
});

/**
 * Baseline for Sub-project B: how many compiled nodes cannot show their label at the requested
 * size in the fixed-height box the compiler draws today. Informational; printed with DEBUG_BASELINE=1.
 */
describe("current engine baseline: label fit", () => {
  it.each(entries)("%s: label fit report", (name, doc) => {
    const elements = compileAIDiagramToCanvas(doc, "frame-fixture").filter((e) => e.type === "semantic-node");
    const ctx = createEstimateContext();
    let shrunk = 0;
    let dropped = 0;
    const worst: string[] = [];
    for (const el of elements) {
      const [a, b] = el.points;
      const bounds = { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y, width: b.x - a.x, height: b.y - a.y };
      const region = getShapeLabelRegion("semantic-node", bounds);
      const layout = layoutShapeLabel(ctx, {
        label: el.label ?? "",
        boxWidth: region.width,
        boxHeight: region.height,
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        maxLines: region.maxLines,
      });
      if (!layout || !layout.fits) dropped += 1;
      else if (layout.fontSize < (el.fontSize ?? 16)) shrunk += 1;
      if (!layout || !layout.fits || layout.fontSize < (el.fontSize ?? 16)) worst.push(`${el.label?.replace("\n", "\\n")} -> ${layout ? layout.fontSize : "none"}px${layout?.fits ? "" : " (cut)"}`);
    }
    if (process.env.DEBUG_BASELINE) {
      console.log(`BASELINE ${name}: nodes=${elements.length} shrunk=${shrunk} cut=${dropped}\n  ${worst.join("\n  ")}`);
    }
    expect(shrunk + dropped).toBeLessThanOrEqual(elements.length);
  });
});

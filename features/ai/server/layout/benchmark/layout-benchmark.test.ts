import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCanvas, compileAIDiagramDetailed, prepareDiagram, type CompileResult } from "@/features/ai/server/canvas-compiler";
import type { AIDiagramDocumentV1 } from "@/features/ai/types";
import { LAYOUT_FIXTURES } from "../fixtures";
import { compareLayouts, measureLayout, type LayoutMetrics } from "../metrics";
import type { PlacementEngine } from "../types";
import { createElkEngine, type AsyncPlacementEngine } from "./elk-placement";

/**
 * Layered (in-repo) vs ELK.js on identical input. Both receive the same prepared graph: the same
 * node sizes (from the text foundation), edges, edge-label widths, groups and gaps. Connectors are
 * routed by the same router, bundled by the same step and labelled by the same placer, so every
 * difference below comes from where the engine puts the nodes.
 *
 * Run `WRITE_BENCHMARK_REPORT=1 npx vitest run features/ai/server/layout/benchmark` to rewrite
 * docs/superpowers/reports/layout-benchmark-table.md.
 */

type Fixture = AIDiagramDocumentV1;
type Run = (doc: Fixture) => Promise<CompileResult>;

const layeredRun: Run = async (doc) => compileAIDiagramDetailed(doc, "f");
const elkRun = (engine: AsyncPlacementEngine): Run => async (doc) => {
  const prepared = prepareDiagram(doc);
  return buildCanvas(doc, "f", prepared, await engine(prepared.input));
};

const ENGINES: Record<string, Run> = {
  layered: layeredRun,
  "elk (network simplex)": elkRun(createElkEngine()),
  "elk (brandes-koepf)": elkRun(createElkEngine({ "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF" })),
};

const withExtraNode = (doc: Fixture): Fixture => {
  const anchor = doc.nodes[Math.floor(doc.nodes.length / 2)];
  return {
    ...doc,
    nodes: [...doc.nodes, { id: "extra", label: "Extra audit logger", kind: "service", layer: anchor.layer }],
    edges: [...doc.edges, { id: "extra-e", from: anchor.id, to: "extra" }],
  };
};

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

interface Row {
  fixture: string;
  engine: string;
  metrics: LayoutMetrics;
  diagnostics: CompileResult["diagnostics"];
  ms: number;
  deterministic: boolean;
  addMoved: number;
  addShift: number;
}

const rows: Row[] = [];
const fixtures = Object.entries(LAYOUT_FIXTURES) as Array<[string, Fixture]>;

describe("layout benchmark: layered vs ELK on identical fixtures", () => {
  it("measures every engine on every fixture", async () => {
    // First ELK call loads the bundle; keep that out of the timings.
    await ENGINES["elk (network simplex)"](fixtures[3][1]);
    for (const [fixture, doc] of fixtures) {
      for (const [engine, run] of Object.entries(ENGINES)) {
        const times: number[] = [];
        let result!: CompileResult;
        for (let i = 0; i < 5; i += 1) {
          const t0 = performance.now();
          result = await run(doc);
          times.push(performance.now() - t0);
        }
        const again = await run(doc);
        const extra = compareLayouts(result.elements, (await run(withExtraNode(doc))).elements);
        rows.push({
          fixture,
          engine,
          metrics: measureLayout(result.elements, doc.groups),
          diagnostics: result.diagnostics,
          ms: Math.round(median(times)),
          deterministic: JSON.stringify(result.elements) === JSON.stringify(again.elements),
          addMoved: Math.round(extra.movedFraction * 100),
          addShift: Math.round(extra.meanShift),
        });
      }
    }
    expect(rows).toHaveLength(fixtures.length * Object.keys(ENGINES).length);
  }, 120_000);

  const pick = (fixture: string, engine: string) => rows.find((r) => r.fixture === fixture && r.engine === engine)!;

  it("every engine is deterministic", () => {
    rows.forEach((r) => expect(r.deterministic, `${r.engine} on ${r.fixture}`).toBe(true));
  });

  describe("guarantees the chosen engine (layered) keeps on every fixture", () => {
    it.each(fixtures.map(([name]) => name))("%s: no node overlaps, no colliding labels, no shrunk or dropped anything", (name) => {
      const m = pick(name, "layered").metrics;
      expect(m.nodeOverlaps).toBe(0);
      expect(m.labelsColliding).toBe(0);
      expect(m.labelsShrunk).toBe(0);
      expect(m.labelsCut).toBe(0);
      expect(m.groupsDropped).toBe(0);
      expect(m.groupViolations).toBe(0);
    });

    // Ceilings sit a little above what was measured, so a real regression fails and noise does not.
    const CEILINGS: Record<string, Partial<Record<keyof LayoutMetrics, number>>> = {
      architecture: { edgeCrossings: 6, edgeThroughNodes: 0, edgeOverlaps: 3, detouredEdges: 0 },
      flowchart: { edgeCrossings: 5, edgeThroughNodes: 0, edgeOverlaps: 6, detouredEdges: 0 },
      "mind-map": { edgeCrossings: 1, edgeThroughNodes: 0, edgeOverlaps: 1, detouredEdges: 0 },
      stress: { edgeCrossings: 45, edgeThroughNodes: 2, edgeOverlaps: 28, detouredEdges: 1 },
      "auth-flow": { edgeCrossings: 6, edgeThroughNodes: 0, edgeOverlaps: 11, detouredEdges: 0 },
    };
    it.each(Object.entries(CEILINGS))("%s: connector quality stays within its ceiling", (name, ceilings) => {
      const m = pick(name, "layered").metrics;
      for (const [key, max] of Object.entries(ceilings)) {
        expect(m[key as keyof LayoutMetrics], `${name} ${key}`).toBeLessThanOrEqual(max);
      }
    });
  });

  describe("why layered was kept (the evidence for the decision)", () => {
    it.each(fixtures.map(([name]) => name))("%s: connectors and area no larger than ELK's", (name) => {
      const ours = pick(name, "layered").metrics;
      for (const elk of ["elk (network simplex)", "elk (brandes-koepf)"]) {
        const theirs = pick(name, elk).metrics;
        expect(ours.totalEdgeLength, `${name} vs ${elk}: edge length`).toBeLessThanOrEqual(theirs.totalEdgeLength * 1.05);
        expect(ours.area, `${name} vs ${elk}: area`).toBeLessThanOrEqual(theirs.area);
      }
    });

    // ELK with network-simplex placement reaches 0 crossings on the flowchart (layered: 3). That gap is
    // real and recorded in the report; the bound here is what we claim, not what we wish.
    it.each(fixtures.map(([name]) => name))("%s: crossings within 3 of the better ELK configuration", (name) => {
      const best = Math.min(pick(name, "elk (network simplex)").metrics.edgeCrossings, pick(name, "elk (brandes-koepf)").metrics.edgeCrossings);
      // The dense stress graph is judged by ratio: a fixed slack means little at 40 crossings.
      const allowed = name === "stress" ? Math.ceil(best * 1.15) : best + 3;
      expect(pick(name, "layered").metrics.edgeCrossings).toBeLessThanOrEqual(allowed);
    });

    it("adding one node disturbs the layered layout less than it disturbs ELK's, on most fixtures", () => {
      const wins = fixtures.filter(([name]) => {
        const ours = pick(name, "layered").addShift;
        return ours <= Math.min(pick(name, "elk (network simplex)").addShift, pick(name, "elk (brandes-koepf)").addShift) + 5;
      }).length;
      expect(wins).toBeGreaterThanOrEqual(Math.ceil(fixtures.length / 2));
    });
  });

  it("writes the report when asked", () => {
    if (!process.env.WRITE_BENCHMARK_REPORT) return;
    const dir = fileURLToPath(new URL("../../../../../docs/superpowers/reports/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    const header = "| fixture | engine | nodes | crossings | shared-line overlaps | through nodes | bends | edge length | colliding labels | groups dropped | label shrunk | area (M px²) | ms | adding 1 node: mean shift px |";
    const rule = "|" + " --- |".repeat(14);
    const lines = rows.map((r) => {
      const m = r.metrics;
      return `| ${r.fixture} | ${r.engine} | ${m.nodes} | ${m.edgeCrossings} | ${m.edgeOverlaps} | ${m.edgeThroughNodes} | ${m.bends} | ${m.totalEdgeLength} | ${m.labelsColliding} | ${m.groupsDropped} | ${m.labelsShrunk} | ${(m.area / 1e6).toFixed(1)} | ${r.ms} | ${r.addShift} |`;
    });
    writeFileSync(`${dir}/layout-benchmark-table.md`, [header, rule, ...lines].join("\n") + "\n");
  });
});

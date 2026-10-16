import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";
import { BASELINE_NAMES } from "./baseline-fixtures";

const suite = findChrome() ? describe : describe.skip;
// SAVE_EXPORT_DIR=<dir> keeps a PNG per diagram and writes baseline-metrics.json for inspection.
const OUT = process.env.SAVE_EXPORT_DIR;
const OLD = ["architecture", "flowchart", "mind-map", "stress", "auth-flow"] as const;

interface Row {
  name: string;
  nodes: number;
  edges: number;
  overlaps: number;
  edgeThroughNodes: number;
  labelsColliding: number;
  crossings: number;
  diagnostics: number;
  compileMs: number;
  exportMs: number;
  size: [number, number];
  svgTextRuns: number;
  missingWords: string[];
  inkTouchesEdge: boolean;
  png: string;
}

suite("baseline diagrams: compile, measure and export in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
  });
  afterAll(async () => {
    await s?.close();
  });

  const names = [...OLD, ...BASELINE_NAMES];
  const rows: Row[] = [];

  for (const name of names) {
    it(`${name}: no overlaps, nothing dropped, exports cleanly`, async () => {
      const row = await s.page.evaluate(async (name) => {
        const T = window.T;
        const doc = (T.baseline as unknown as Record<string, unknown>)[name] ?? T.LAYOUT_FIXTURES[name as "architecture"];
        const t0 = performance.now();
        const compiled = T.compileAIDiagramDetailed(doc as never, "frame");
        const compileMs = performance.now() - t0;
        const elements = compiled.elements;
        const groups = (doc as { groups: Array<{ id: string; nodeIds: string[] }> }).groups;
        const m = T.measureLayout(elements, groups);

        const opts = { format: "svg" as const, scale: 1 as const, transparent: true, selectionOnly: false };
        const t1 = performance.now();
        const svg = await T.exportScene({ elements, selectedIds: [], options: opts });
        const png = await T.exportScene({ elements, selectedIds: [], options: { ...opts, format: "png" } });
        const exportMs = performance.now() - t1;

        const text = await svg.blob.text();
        const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
        const shown = [...parsed.querySelectorAll("text")].map((t) => t.textContent ?? "").join(" ").replace(/\s+/g, "");
        const missing: string[] = [];
        for (const node of (doc as { nodes: Array<{ label: string }> }).nodes) {
          for (const word of node.label.split(/\s+/).filter(Boolean)) if (!shown.includes(word.replace(/\s+/g, ""))) missing.push(word);
        }

        const bmp = await createImageBitmap(png.blob);
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let touches = false;
        for (let x = 0; x < c.width && !touches; x++) for (const y of [0, c.height - 1]) if (d[(y * c.width + x) * 4 + 3] > 0) touches = true;
        for (let y = 0; y < c.height && !touches; y++) for (const x of [0, c.width - 1]) if (d[(y * c.width + x) * 4 + 3] > 0) touches = true;

        const buf = new Uint8Array(await png.blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return {
          name,
          nodes: m.nodes,
          edges: m.edges,
          overlaps: m.nodeOverlaps,
          edgeThroughNodes: m.edgeThroughNodes,
          labelsColliding: m.labelsColliding,
          crossings: m.edgeCrossings,
          diagnostics: Object.values(compiled.diagnostics ?? {}).filter((v) => Array.isArray(v) && v.length > 0).length,
          compileMs: Math.round(compileMs),
          exportMs: Math.round(exportMs),
          size: [svg.width, svg.height] as [number, number],
          svgTextRuns: parsed.querySelectorAll("text").length,
          missingWords: missing,
          inkTouchesEdge: touches,
          png: btoa(bin),
          parseError: parsed.querySelector("parsererror")?.textContent ?? null,
        };
      }, name);
      rows.push(row as Row);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/baseline-${name}.png`, Buffer.from(row.png, "base64"));
      }
      expect((row as { parseError: string | null }).parseError).toBeNull();
      expect(row.overlaps, "node boxes overlap").toBe(0);
      // The stress fixture is the known worst case: 2 connectors through nodes is the documented baseline
      // (features/ai/server/layout/benchmark/layout-benchmark.test.ts), so it may not get worse.
      expect(row.edgeThroughNodes, "connector passes through a node").toBeLessThanOrEqual(name === "stress" ? 2 : 0);
      expect(row.missingWords, "label words missing from the SVG").toEqual([]);
      expect(row.inkTouchesEdge, "ink reaches the image edge (clipped)").toBe(false);
    });
  }

  it("writes the metrics table when asked", () => {
    if (!OUT) return;
    writeFileSync(`${OUT}/baseline-metrics.json`, JSON.stringify(rows.map(({ png: _png, ...rest }) => rest), null, 2));
  });
});

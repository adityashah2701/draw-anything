import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportOptions, ExportResult } from "@/features/whiteboard/export/export-scene";
import type { ConnectorRelation, DrawingElement, RelationKind } from "@/features/whiteboard/types/whiteboard.types";
import { findChrome, openPage, type BrowserSession } from "./harness";

declare global {
  interface Window {
    REL: {
      line(relation: ConnectorRelation | undefined): DrawingElement;
      canvasDark(el: DrawingElement): number;
      exportDark(el: DrawingElement, format: "png"): Promise<{ dark: number; w: number; h: number }>;
      exportText(el: DrawingElement, format: "svg" | "pdf"): Promise<{ text: string; size: number; head: string }>;
      run(elements: unknown[], options: Partial<ExportOptions>): Promise<ExportResult>;
    };
  }
}

const suite = findChrome() ? describe : describe.skip;

// Runs inside the page, next to the real shapes and export code on window.T.
const HELPERS = `
const dark = (data) => { let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128 && data[i] < 110) n++; return n; };
window.REL = {
  line: (relation) => ({ id: "c", type: "arrow", color: "#000000", strokeWidth: 2, routingMode: "straight", arrowHeadEnd: true, points: [{ x: 60, y: 60 }, { x: 300, y: 60 }], ...(relation ? { relation } : {}) }),
  canvasDark(el) {
    const c = document.createElement("canvas"); c.width = 400; c.height = 140;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 400, 140);
    T.drawElement(ctx, el, false, { zoom: 1, panOffset: { x: 0, y: 0 }, getElementBounds: () => null });
    return dark(ctx.getImageData(0, 0, 400, 140).data);
  },
  run: (elements, options) => T.exportScene({ elements, selectedIds: [], options: { format: "png", scale: 1, transparent: false, selectionOnly: false, ...options } }),
  async exportDark(el) {
    const r = await T.exportScene({ elements: [el], selectedIds: [], options: { format: "png", scale: 1, transparent: false, selectionOnly: false } });
    const bmp = await createImageBitmap(r.blob);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    return { dark: dark(ctx.getImageData(0, 0, c.width, c.height).data), w: bmp.width, h: bmp.height };
  },
  async exportText(el, format) {
    const r = await T.exportScene({ elements: [el], selectedIds: [], options: { format, scale: 1, transparent: false, selectionOnly: false } });
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    const head = String.fromCharCode(...bytes.subarray(0, 8));
    return { text: format === "svg" ? await r.blob.text() : "", size: r.blob.size, head };
  },
};
`;

const KINDS: RelationKind[] = [
  "association", "directed-association", "generalization", "realization", "dependency", "aggregation", "composition", "er-relationship",
  "sequence-flow", "message-flow", "bpmn-association", "assembly", "sync-message", "async-message", "return-message", "create-message", "destroy-message",
];

suite("connector relations in real Chrome: canvas, SVG, PNG and PDF", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
    await s.page.addScriptTag({ content: HELPERS });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("draws every relation kind, and the PNG export has the same ink as the canvas", async () => {
    const out = await s.page.evaluate(async (kinds) => {
      const rows: Array<{ kind: string; canvas: number; png: number; plain: number }> = [];
      const plain = window.REL.canvasDark(window.REL.line(undefined));
      for (const kind of kinds) {
        const el = window.REL.line({ kind } as never);
        const exported = await window.REL.exportDark(el, "png");
        rows.push({ kind, canvas: window.REL.canvasDark(el), png: exported.dark, plain });
      }
      return rows;
    }, KINDS);
    expect(out).toHaveLength(17);
    for (const r of out) {
      expect(r.canvas, `${r.kind} draws something`).toBeGreaterThan(100);
      // Same drawing code, so about the same ink: the export differs by its margin, anti-aliasing and where a dash pattern starts.
      // (A dotted line has so little ink that a few dots more or less decide the ratio, so it gets an absolute allowance too.)
      expect(Math.abs(r.png - r.canvas), `${r.kind}: PNG against canvas`).toBeLessThanOrEqual(Math.max(r.canvas * 0.22, 40));
    }
    // A hollow triangle at the target, a cross, and a dotted line each change the picture of the plain line.
    const by = Object.fromEntries(out.map((r) => [r.kind, r.canvas]));
    expect(by.generalization).not.toBe(by.association);
    expect(by["destroy-message"]).toBeGreaterThan(by.association);
    expect(by["bpmn-association"]).toBeLessThan(by.association);
    expect(by.realization).toBeLessThan(by.generalization); // dashed
  });

  it("draws both ER notations from the same data: crow's foot as glyphs, Chen as text", async () => {
    const out = await s.page.evaluate(async () => {
      const ends = { start: { cardinality: "one" }, end: { cardinality: "zero-or-many" } };
      const crow = window.REL.line({ kind: "er-relationship", ...ends } as never);
      const chen = window.REL.line({ kind: "er-relationship", notation: "chen", ...ends } as never);
      const svgCrow = await window.REL.exportText(crow, "svg");
      const svgChen = await window.REL.exportText(chen, "svg");
      return { crow: svgCrow.text, chen: svgChen.text, crowDark: window.REL.canvasDark(crow), chenDark: window.REL.canvasDark(chen) };
    });
    expect(out.crow).not.toContain("<text");
    expect(out.chen).toContain(">1<");
    expect(out.chen).toContain(">0..N<");
    expect(out.crowDark).toBeGreaterThan(0);
    expect(out.chenDark).toBeGreaterThan(0);
  });

  it("writes multiplicity and roles beside the line in the SVG, and exports a valid PDF", async () => {
    const out = await s.page.evaluate(async () => {
      const el = window.REL.line({ kind: "composition", start: { multiplicity: "1", role: "owner" }, end: { multiplicity: "0..*", role: "items" } } as never);
      return { svg: await window.REL.exportText(el, "svg"), pdf: await window.REL.exportText(el, "pdf") };
    });
    for (const word of [">1<", ">0..*<", ">owner<", ">items<"]) expect(out.svg.text).toContain(word);
    expect(out.svg.text.includes("<script") || out.svg.text.includes("href=")).toBe(false);
    expect(out.pdf.head.startsWith("%PDF")).toBe(true);
    expect(out.pdf.size).toBeGreaterThan(300);
  });

  it("draws a connector with no relation exactly as it was before", async () => {
    const same = await s.page.evaluate(async () => {
      const legacy = window.REL.line(undefined);
      const withUndefined = { ...legacy, relation: undefined };
      const a = await window.REL.exportText(legacy, "svg");
      const b = await window.REL.exportText(withUndefined, "svg");
      return a.text === b.text && a.text.includes("<path");
    });
    expect(same).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportOptions, ExportResult } from "@/features/whiteboard/export/export-scene";
import { findChrome, openPage, type BrowserSession } from "../harness";

declare global {
  interface Window {
    O: {
      ids(): string[];
      parametric(): Array<{ id: string; props: Record<string, unknown> }>;
      run(elements: unknown[], options: Partial<ExportOptions>): Promise<ExportResult>;
      ink(blob: Blob): Promise<{ width: number; height: number; ink: number; dark: number; inkWidth: number; inkHeight: number }>;
    };
  }
}

const suite = findChrome() ? describe : describe.skip;

// Runs inside the page, next to the real shapes and export code on window.T.
const HELPERS = `
window.O = {
  ids: () => T.listOutlineVariants().map((v) => v.id),
  parametric: () => T.supportedEntries().filter((e) => e.representation.kind === "parametric").map((e) => ({ id: e.id, props: T.outlinePropsOf(e) })),
  run: (elements, options) => T.exportScene({ elements, selectedIds: [], options: { format: "png", scale: 1, transparent: true, selectionOnly: false, ...options } }),
  async ink(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, dark = 0, minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { ink++; if (d[(y * c.width + x) * 4 + 3] > 128 && d[(y * c.width + x) * 4] < 110) dark++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return { width: bmp.width, height: bmp.height, ink, dark, inkWidth: maxX - minX + 1, inkHeight: maxY - minY + 1 };
  },
};
`;

suite("outline shapes in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
    await s.page.addScriptTag({ content: HELPERS });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("every outline exports to PNG and SVG, and its ink fills the box it was given", async () => {
    const out = await s.page.evaluate(async () => {
      const results: Array<{ id: string; w: number; h: number; inkW: number; inkH: number; svgPaths: number }> = [];
      for (const id of window.O.ids()) {
        const el = { id, type: "outline", variant: id, color: "#000000", strokeWidth: 2, fill: "#dbeafe", label: id, points: [{ x: 0, y: 0 }, { x: 200, y: 120 }] };
        const png = await window.O.run([el], {});
        const px = await window.O.ink(png.blob);
        const svg = await (await window.O.run([el], { format: "svg" })).blob.text();
        results.push({ id, w: 200, h: 120, inkW: px.inkWidth, inkH: px.inkHeight, svgPaths: (svg.match(/<path/g) ?? []).length });
      }
      return results;
    });
    expect(out.length).toBeGreaterThanOrEqual(17);
    for (const r of out) {
      // The export adds a margin around the ink, so only the ink's own size is compared with the box.
      expect(r.inkW, `${r.id} width`).toBeGreaterThanOrEqual(r.w * 0.85);
      expect(r.inkH, `${r.id} height`).toBeGreaterThanOrEqual(r.h * 0.85);
      expect(r.svgPaths, `${r.id} svg`).toBeGreaterThanOrEqual(1);
    }
  });

  it("parametric entries export with their border, marker and stack, and look different from their plain base", async () => {
    const out = await s.page.evaluate(async () => {
      const box = [{ x: 0, y: 0 }, { x: 160, y: 120 }];
      const base = (variant: string) => ({ id: "b", type: "outline", variant, color: "#000000", strokeWidth: 2, fill: "#dbeafe", points: box });
      const results: Array<{ id: string; ink: number; plainInk: number; inkW: number; inkH: number; svg: string; plainSvg: string }> = [];
      for (const { id, props } of window.O.parametric()) {
        const el = { ...base(String(props.variant)), ...props };
        const px = await window.O.ink((await window.O.run([el], {})).blob);
        const plain = await window.O.ink((await window.O.run([base(String(props.variant))], {})).blob);
        results.push({
          id,
          ink: px.dark,
          plainInk: plain.dark,
          inkW: px.inkWidth,
          inkH: px.inkHeight,
          svg: await (await window.O.run([el], { format: "svg" })).blob.text(),
          plainSvg: await (await window.O.run([base(String(props.variant))], { format: "svg" })).blob.text(),
        });
      }
      return results;
    });
    expect(out.length).toBeGreaterThanOrEqual(12);
    for (const r of out) {
      expect(r.svg, `${r.id} svg`).toContain("<path");
      expect(r.svg.includes("<script") || r.svg.includes("href="), `${r.id} svg is clean`).toBe(false);
      expect(r.inkW, `${r.id} width`).toBeGreaterThanOrEqual(160 * 0.85);
      expect(r.inkH, `${r.id} height`).toBeGreaterThanOrEqual(120 * 0.85);
      // A plain ring or rhombus is the only picture with no parameters; every other entry adds drawing to it.
      if (r.id !== "start-event") {
        expect(r.svg, `${r.id} differs from its base in the SVG`).not.toBe(r.plainSvg);
        expect(r.ink, `${r.id} has more dark ink (lines and glyphs) than its plain base`).toBeGreaterThan(r.plainInk);
      }
    }
  });
});

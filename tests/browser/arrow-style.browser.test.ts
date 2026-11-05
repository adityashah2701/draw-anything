import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportOptions, ExportResult } from "@/features/whiteboard/export/export-scene";
import { findChrome, openPage, type BrowserSession } from "./harness";

declare global {
  interface Window {
    A: {
      run(elements: unknown[], options: Partial<ExportOptions>): Promise<ExportResult>;
      topRowRight(blob: Blob): Promise<number>;
    };
  }
}

const suite = findChrome() ? describe : describe.skip;

// Runs inside the page, next to the real export code on window.T.
const HELPERS = `
window.A = {
  run: (elements, options) => T.exportScene({ elements, selectedIds: [], options: { format: "png", scale: 1, transparent: false, selectionOnly: false, ...options } }),
  // x of the right-most inked pixel on the top-most inked row: how far the top edge runs before the corner turns down.
  async topRowRight(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const inked = (x, y) => d[(y * c.width + x) * 4] < 200;
    let top = -1;
    for (let y = 0; y < c.height && top < 0; y++) for (let x = 0; x < c.width; x++) if (inked(x, y)) { top = y; break; }
    let right = -1;
    for (let x = 0; x < c.width; x++) if (inked(x, top)) right = x;
    return right;
  },
};
`;

const arrow = (extra: Record<string, unknown>) => ({
  id: "a",
  type: "arrow",
  color: "#000000",
  strokeWidth: 2,
  routingMode: "orthogonal",
  arrowHeadEnd: true,
  points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }],
  ...extra,
});

suite("arrow corners and heads in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
    await s.page.addScriptTag({ content: HELPERS });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("a rounded corner turns down before the sharp corner does, and a saved arrow without a radius stays sharp", async () => {
    const r = await s.page.evaluate(
      async (els) => {
        const sharp = await window.A.run([els.sharp], {});
        const round = await window.A.run([els.round], {});
        return { sharp: await window.A.topRowRight(sharp.blob), round: await window.A.topRowRight(round.blob) };
      },
      { sharp: arrow({}), round: arrow({ cornerRadius: 24 }) },
    );
    expect(r.sharp - r.round).toBeGreaterThanOrEqual(15);
  });

  it("the SVG export carries the same rounded corner and the crow's-foot head as curve and line commands", async () => {
    const svg = await s.page.evaluate(
      async (el) => (await window.A.run([el], { format: "svg" })).blob.text(),
      arrow({ cornerRadius: 24, headEnd: "crow-zero-many" }),
    );
    expect(svg).toMatch(/Q200 0 200 24/);
    expect(svg).toMatch(/A\d/); // the circle of the optional end
    expect(svg).not.toContain("<image");
  });

  it("exports PNG and SVG of the same arrow without error for every head kind", async () => {
    const kinds = ["triangle", "open", "hollow-triangle", "diamond", "diamond-filled", "circle", "crow-one", "crow-many", "crow-zero-one", "crow-zero-many", "crow-exactly-one"];
    const out = await s.page.evaluate(
      async (list) => {
        const sizes: number[] = [];
        for (const kind of list) {
          const el = { id: "a", type: "arrow", color: "#000000", strokeWidth: 2, routingMode: "orthogonal", arrowHeadEnd: true, headEnd: kind, cornerRadius: 12, points: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 120 }] };
          const png = await window.A.run([el], {});
          const svg = await window.A.run([el], { format: "svg" });
          sizes.push(png.blob.size, (await svg.blob.text()).length);
        }
        return sizes;
      },
      kinds,
    );
    expect(out.every((n) => n > 0)).toBe(true);
  });
});

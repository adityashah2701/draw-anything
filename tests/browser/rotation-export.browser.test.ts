import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

const rect = (id: string, rotation: number | undefined) => ({
  id,
  type: "rectangle",
  points: [{ x: 0, y: 0 }, { x: 200, y: 60 }],
  color: "#1f2937",
  strokeWidth: 2,
  fill: "#dbeafe",
  label: "Rotated label",
  ...(rotation === undefined ? {} : { rotation }),
});

declare global {
  interface Window {
    R: { run(elements: unknown[], format: "svg" | "png"): Promise<{ width: number; height: number; text?: string; ink?: { minX: number; maxX: number; minY: number; maxY: number } }> };
  }
}

const HELPERS = `
window.R = {
  async run(elements, format) {
    const res = await T.exportScene({ elements, selectedIds: [], options: { format, scale: 1, transparent: true, selectionOnly: false } });
    if (format === "svg") return { width: res.width, height: res.height, text: await res.blob.text() };
    const bmp = await createImageBitmap(res.blob);
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return { width: res.width, height: res.height, ink: { minX, maxX, minY, maxY } };
  },
};
`;

suite("rotated shapes in export", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true });
    await s.page.addScriptTag({ content: HELPERS });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("a quarter turn swaps the exported width and height (the export measures what was drawn)", async () => {
    const [upright, turned] = await s.page.evaluate(async (els) => [await window.R.run([els[0]], "svg"), await window.R.run([els[1]], "svg")], [rect("a", undefined), rect("b", 90)]);
    expect(turned.width).toBeCloseTo(upright.height, 0);
    expect(turned.height).toBeCloseTo(upright.width, 0);
    expect(turned.width).toBeLessThan(turned.height);
  });

  it("the SVG carries the rotation as a transform and keeps the label", async () => {
    const out = await s.page.evaluate((el) => window.R.run([el], "svg"), rect("a", 90));
    expect(out.text).toMatch(/transform="matrix\(/);
    expect(out.text).toContain("Rotated label");
  });

  it("the PNG ink lies where the rotated shape is, not where the unrotated one was", async () => {
    const { ink, width, height } = await s.page.evaluate((el) => window.R.run([el], "png"), rect("a", 90));
    // The export box hugs the drawing, so ink fills it almost edge to edge on both axes.
    expect(ink!.maxX - ink!.minX).toBeGreaterThan(width - 60);
    expect(ink!.maxY - ink!.minY).toBeGreaterThan(height - 60);
    expect(height).toBeGreaterThan(width);
  });

  it("an upright shape is exported exactly as before: no transform is added", async () => {
    const out = await s.page.evaluate((el) => window.R.run([el], "svg"), rect("a", undefined));
    expect(out.text).not.toMatch(/matrix\(0/);
  });

  it("a shape turned by an angle that is not a quarter turn grows the export box to hold it", async () => {
    const [upright, diagonal] = await s.page.evaluate(async (els) => [await window.R.run([els[0]], "svg"), await window.R.run([els[1]], "svg")], [rect("a", undefined), rect("b", 45)]);
    expect(diagonal.height).toBeGreaterThan(upright.height);
    expect(diagonal.width).toBeLessThan(upright.width * 1.2);
  });
});

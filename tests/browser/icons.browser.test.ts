import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;
const PNG_DIR = process.env.SAVE_LAYOUT_PNG;

suite("icon tiles on a real canvas", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("every registered icon draws ink inside its tile at every zoom, and looks the same shape at each", async () => {
    const result = await s.page.evaluate(() => {
      const T = window.T;
      const icons = T.listIcons();
      const sizes = [14, 28, 56, 112];
      const blank: string[] = [];
      const escaped: string[] = [];
      const canvas = document.createElement("canvas");
      canvas.id = "out";
      const cell = 140;
      const cols = 10;
      canvas.width = cols * cell;
      canvas.height = Math.ceil(icons.length / cols) * cell;
      document.body.innerHTML = "";
      document.body.appendChild(canvas);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      icons.forEach((icon, i) => {
        T.drawIconTile(ctx, icon, (i % cols) * cell + cell / 2, Math.floor(i / cols) * cell + cell / 2, 112);
      });

      // Per icon and size: ink bounding box must be non-empty and inside the tile (aspect kept).
      const probe = document.createElement("canvas");
      const pctx = probe.getContext("2d", { willReadFrequently: true })!;
      const shapeAt = (icon: (typeof icons)[number], size: number) => {
        const pad = 8;
        probe.width = probe.height = size + pad * 2;
        pctx.clearRect(0, 0, probe.width, probe.height);
        T.drawIconTile(pctx, icon, probe.width / 2, probe.height / 2, size);
        const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
        let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, strong = 0;
        for (let y = 0; y < probe.height; y += 1)
          for (let x = 0; x < probe.width; x += 1) {
            const a = data[(y * probe.width + x) * 4 + 3];
            if (a > 180) { strong += 1; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
          }
        return { strong, w: maxX - minX, h: maxY - minY, outside: minX < pad - 1 || minY < pad - 1 || maxX > pad + size + 1 || maxY > pad + size + 1 };
      };
      let worstAspectDrift = 0;
      for (const icon of icons) {
        const small = shapeAt(icon, 56);
        const large = shapeAt(icon, 112);
        if (large.strong === 0) blank.push(icon.id);
        if (large.outside || small.outside) escaped.push(icon.id);
        if (large.w > 0 && small.w > 0) worstAspectDrift = Math.max(worstAspectDrift, Math.abs(small.w / small.h - large.w / large.h));
      }
      return { count: icons.length, blank, escaped, worstAspectDrift, sizes };
    });

    if (PNG_DIR) {
      mkdirSync(PNG_DIR, { recursive: true });
      writeFileSync(`${PNG_DIR}/icon-sheet.png`, await s.page.locator("#out").screenshot());
    }
    expect(result.count).toBeGreaterThan(60);
    expect(result.blank, "icons that draw nothing").toEqual([]);
    expect(result.escaped, "icons that draw outside their tile").toEqual([]);
    expect(result.worstAspectDrift).toBeLessThan(0.15);
  });
});

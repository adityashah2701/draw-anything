import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

suite("canvas interaction math in real Chrome", () => {
  let s: BrowserSession;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
  });
  afterAll(async () => {
    await s?.close();
  });

  it("a guide is a crisp 1px line at the snapped edge, at any zoom and pan", async () => {
    const result = await s.page.evaluate(() => {
      const T = window.T;
      const out: Array<{ zoom: number; hit: number; leftOfLine: number; rightOfLine: number }> = [];
      for (const zoom of [0.5, 1, 2.25]) {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const pan = { x: 37, y: 21 };
        // Drag a 100x50 box so its right edge lands 1.5 units from a neighbour's left edge (x = 300).
        const drag = T.computeDrag({
          start: { x: 0, y: 0 },
          point: { x: 198.5, y: 0 },
          selection: { minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 },
          targets: [{ minX: 300, minY: 120, maxX: 380, maxY: 160, width: 80, height: 40 }],
          threshold: 6 / zoom,
          snap: true,
        });
        T.drawGuides(ctx, drag.guides, zoom, pan);
        const lineX = Math.round(300 * zoom + pan.x);
        const midY = Math.round((60 * zoom + pan.y));
        const px = (x: number) => ctx.getImageData(x, midY, 1, 1).data[3];
        // the dashed line may have a gap at midY: scan a column segment instead
        let hit = 0;
        for (let y = Math.round(pan.y); y < Math.round(160 * zoom + pan.y); y += 1) hit += ctx.getImageData(lineX, y, 1, 1).data[3] > 100 ? 1 : 0;
        out.push({ zoom, hit, leftOfLine: px(lineX - 2), rightOfLine: px(lineX + 2) });
      }
      return out;
    });
    for (const r of result) {
      expect(r.hit, `zoom ${r.zoom}: ink on the guide column`).toBeGreaterThan(10);
      expect(r.leftOfLine, `zoom ${r.zoom}`).toBe(0);
      expect(r.rightOfLine, `zoom ${r.zoom}`).toBe(0);
    }
  });

  it("zoom about a point leaves that point's pixel fixed (wheel and button zoom), with real floats", async () => {
    const drift = await s.page.evaluate(() => {
      const T = window.T;
      let view = { zoom: 1, panOffset: { x: 0, y: 0 } };
      const anchor = { x: 431.7, y: 288.3 };
      const world0 = { x: (anchor.x - view.panOffset.x) / view.zoom, y: (anchor.y - view.panOffset.y) / view.zoom };
      let worst = 0;
      for (let i = 0; i < 400; i += 1) {
        const intent = T.wheelIntent({ deltaX: 0, deltaY: i % 3 === 0 ? 90 : -120, deltaMode: 0, ctrlKey: true, metaKey: false });
        if (intent.kind !== "zoom") throw new Error("expected zoom");
        view = T.zoomAtPoint(view, anchor, view.zoom * intent.factor);
        const w = { x: (anchor.x - view.panOffset.x) / view.zoom, y: (anchor.y - view.panOffset.y) / view.zoom };
        worst = Math.max(worst, Math.hypot(w.x - world0.x, w.y - world0.y));
      }
      return worst;
    });
    expect(drift).toBeLessThan(1e-6);
  });
});

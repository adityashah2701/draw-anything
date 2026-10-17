import { describe, expect, it } from "vitest";
import { fitView, pinchView, stepZoom, wheelIntent, zoomAtPoint, MAX_ZOOM, MIN_ZOOM } from "./viewport-math";

const world = (view: { zoom: number; panOffset: { x: number; y: number } }, s: { x: number; y: number }) => ({
  x: (s.x - view.panOffset.x) / view.zoom,
  y: (s.y - view.panOffset.y) / view.zoom,
});

describe("zoomAtPoint", () => {
  it("keeps the world point under the anchor fixed", () => {
    const view = { zoom: 0.8, panOffset: { x: 120, y: -40 } };
    const anchor = { x: 300, y: 210 };
    const before = world(view, anchor);
    const next = zoomAtPoint(view, anchor, 2.5);
    expect(world(next, anchor).x).toBeCloseTo(before.x, 9);
    expect(world(next, anchor).y).toBeCloseTo(before.y, 9);
  });

  it("clamps to the zoom limits without moving the anchor off its point", () => {
    const view = { zoom: 4, panOffset: { x: 10, y: 10 } };
    const next = zoomAtPoint(view, { x: 50, y: 50 }, 99);
    expect(next.zoom).toBe(MAX_ZOOM);
    expect(zoomAtPoint(view, { x: 50, y: 50 }, 0).zoom).toBe(MIN_ZOOM);
  });
});

describe("stepZoom (buttons and Ctrl +/-)", () => {
  it("zooms about the canvas centre instead of the world origin", () => {
    const size = { width: 1000, height: 600 };
    const view = { zoom: 1, panOffset: { x: -200, y: 50 } };
    const centre = { x: 500, y: 300 };
    const before = world(view, centre);
    for (const dir of [1, -1] as const) {
      const next = stepZoom(view, size, dir);
      expect(world(next, centre).x).toBeCloseTo(before.x, 9);
      expect(world(next, centre).y).toBeCloseTo(before.y, 9);
    }
  });
});

describe("fitView", () => {
  const size = { width: 1200, height: 800 };
  it("centres the content", () => {
    const v = fitView({ minX: 100, minY: 100, maxX: 1100, maxY: 700 }, size)!;
    expect(world(v, { x: 600, y: 400 })).toEqual({ x: 600, y: 400 });
  });
  it("never enlarges past 100%, even for a tiny diagram", () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 50, maxY: 30 }, size)!.zoom).toBe(1);
  });
  it("shrinks a huge diagram to fit with padding", () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 8000, maxY: 1000 }, size)!;
    expect(v.zoom).toBeCloseTo((1200 - 160) / 8000, 9);
  });
  it("copes with zero-size content and a zero-size canvas", () => {
    expect(fitView({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, size)!.zoom).toBe(1);
    expect(fitView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe("wheelIntent", () => {
  const base = { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false };
  it("a plain wheel or scroll pans (content moves opposite the scroll)", () => {
    expect(wheelIntent({ ...base, deltaX: 20 })).toEqual({ kind: "pan", dx: -20, dy: -100 });
  });
  it("ctrl/meta wheel (pinch) zooms: scrolling up zooms in", () => {
    const up = wheelIntent({ ...base, deltaY: -100, ctrlKey: true });
    const down = wheelIntent({ ...base, deltaY: 100, metaKey: true });
    expect(up.kind === "zoom" && up.factor > 1).toBe(true);
    expect(down.kind === "zoom" && down.factor < 1).toBe(true);
  });
  it("normalises line and page deltas to pixels", () => {
    expect(wheelIntent({ ...base, deltaY: 3, deltaMode: 1 })).toEqual({ kind: "pan", dx: -0, dy: -48 });
    expect(wheelIntent({ ...base, deltaY: 1, deltaMode: 2 })).toEqual({ kind: "pan", dx: -0, dy: -800 });
  });
});

describe("pinchView", () => {
  const view = { zoom: 1, panOffset: { x: 0, y: 0 } };
  const pair = (ax: number, ay: number, bx: number, by: number) => [{ x: ax, y: ay }, { x: bx, y: by }] as const;

  it("doubles the zoom when the fingers move twice as far apart, keeping the midpoint's world point put", () => {
    const next = pinchView(view, pair(100, 100, 200, 100), pair(50, 100, 250, 100));
    expect(next.zoom).toBeCloseTo(2);
    // world point under the old midpoint (150,100) is still under the new midpoint (150,100)
    expect((150 - next.panOffset.x) / next.zoom).toBeCloseTo(150);
  });

  it("pans by the midpoint's travel when the distance is unchanged", () => {
    const next = pinchView(view, pair(0, 0, 100, 0), pair(30, 40, 130, 40));
    expect(next.zoom).toBe(1);
    expect(next.panOffset).toEqual({ x: 30, y: 40 });
  });

  it("clamps the zoom and survives collapsed fingers", () => {
    expect(pinchView(view, pair(0, 0, 10, 0), pair(0, 0, 10000, 0)).zoom).toBe(MAX_ZOOM);
    expect(pinchView(view, pair(0, 0, 100, 0), pair(0, 0, 0.1, 0)).zoom).toBe(1);
    expect(Number.isFinite(pinchView(view, pair(5, 5, 5, 5), pair(5, 5, 5, 5)).panOffset.x)).toBe(true);
  });
});

describe("fitView with a panel over the right edge", () => {
  it("fits the drawing into what the panel leaves free, centred there", () => {
    const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    const full = fitView(bounds, { width: 1000, height: 800 }, { padding: 0, maxZoom: 10 })!;
    const covered = fitView(bounds, { width: 1000, height: 800 }, { padding: 0, maxZoom: 10, rightInset: 500 })!;
    expect(covered.zoom).toBeCloseTo(full.zoom / 2, 5);
    // The middle of the drawing lands in the middle of the free part (250), not of the whole canvas (500).
    expect(200 * covered.zoom + covered.panOffset.x).toBeCloseTo(250, 5);
  });

  it("returns nothing when the panels cover the whole canvas", () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 400, height: 400 }, { rightInset: 400 })).toBeNull();
  });
});

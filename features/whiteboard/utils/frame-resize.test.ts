import { describe, expect, it } from "vitest";
import { makeBounds } from "@/core/geometry/box";
import { FRAME_PAD_PX } from "./selection-overlay";
import { resizeFrame } from "./frame-resize";

const content = makeBounds(100, 100, 300, 200); // 200 x 100
const base = { content, zoom: 1, minScale: { x: 0.1, y: 0.1 }, keepAspect: false, grab: { x: 0, y: 0 } };
const PAD = FRAME_PAD_PX;

describe("resizeFrame", () => {
  it("moves only the dragged edge; the handle sits outside the content by the frame padding", () => {
    const r = resizeFrame({ ...base, handle: "e", pointer: { x: 400 + PAD, y: 150 } });
    expect(r).toMatchObject({ minX: 100, minY: 100, maxX: 400, maxY: 200 });
    const w = resizeFrame({ ...base, handle: "w", pointer: { x: 50 - PAD, y: 150 } });
    expect(w).toMatchObject({ minX: 50, maxX: 300, minY: 100, maxY: 200 });
  });

  it("resizes both axes from a corner and keeps the opposite corner fixed", () => {
    const r = resizeFrame({ ...base, handle: "nw", pointer: { x: 60 - PAD, y: 80 - PAD } });
    expect(r).toMatchObject({ minX: 60, minY: 80, maxX: 300, maxY: 200 });
    const se = resizeFrame({ ...base, handle: "se", pointer: { x: 350 + PAD, y: 260 + PAD } });
    expect(se).toMatchObject({ minX: 100, minY: 100, maxX: 350, maxY: 260 });
  });

  it("does not jump when the handle is grabbed off-centre", () => {
    const grab = { x: 3, y: -2 };
    const r = resizeFrame({ ...base, handle: "e", grab, pointer: { x: 400 + PAD + 3, y: 148 } });
    expect(r.maxX).toBe(400);
  });

  it("an unmoved handle changes nothing", () => {
    expect(resizeFrame({ ...base, handle: "se", pointer: { x: 300 + PAD, y: 200 + PAD } })).toMatchObject({ minX: 100, minY: 100, maxX: 300, maxY: 200 });
  });

  it("never shrinks below the minimum scale, and never flips", () => {
    const r = resizeFrame({ ...base, minScale: { x: 0.25, y: 0.5 }, handle: "e", pointer: { x: -500, y: 0 } });
    expect(r.minX).toBe(100);
    expect(r.width).toBeCloseTo(50, 6); // 200 * 0.25
    const n = resizeFrame({ ...base, minScale: { x: 0.25, y: 0.5 }, handle: "n", pointer: { x: 0, y: 900 } });
    expect(n.maxY).toBe(200);
    expect(n.height).toBeCloseTo(50, 6); // 100 * 0.5
  });

  it("clamps from the fixed side when dragging the west or north edge past the limit", () => {
    const r = resizeFrame({ ...base, minScale: { x: 0.5, y: 0.5 }, handle: "nw", pointer: { x: 900, y: 900 } });
    expect(r.maxX).toBe(300);
    expect(r.maxY).toBe(200);
    expect(r.width).toBeCloseTo(100, 6);
    expect(r.height).toBeCloseTo(50, 6);
  });

  it("keeps the ratio from a corner when asked, following the axis moved furthest", () => {
    const wide = resizeFrame({ ...base, keepAspect: true, handle: "se", pointer: { x: 500 + PAD, y: 210 + PAD } });
    expect(wide.width / wide.height).toBeCloseTo(2, 6);
    expect(wide.width).toBeCloseTo(400, 6);
    expect([wide.minX, wide.minY]).toEqual([100, 100]);
    const tall = resizeFrame({ ...base, keepAspect: true, handle: "nw", pointer: { x: 90 - PAD, y: -100 - PAD } });
    expect(tall.width / tall.height).toBeCloseTo(2, 6);
    expect([tall.maxX, tall.maxY]).toEqual([300, 200]);
  });

  it("ignores keep-ratio on an edge handle", () => {
    const r = resizeFrame({ ...base, keepAspect: true, handle: "e", pointer: { x: 500 + PAD, y: 0 } });
    expect(r.height).toBe(100);
    expect(r.width).toBe(400);
  });

  it("works at any zoom: the padding is a screen distance", () => {
    for (const zoom of [0.25, 1, 4]) {
      const r = resizeFrame({ ...base, zoom, handle: "e", pointer: { x: 400 + PAD / zoom, y: 150 } });
      expect(r.maxX).toBeCloseTo(400, 9);
    }
  });

  it("copes with a zero-width selection", () => {
    const line = makeBounds(100, 100, 100, 300);
    const r = resizeFrame({ ...base, content: line, keepAspect: true, handle: "se", pointer: { x: 200, y: 400 } });
    expect(Number.isFinite(r.width) && Number.isFinite(r.height)).toBe(true);
  });
});

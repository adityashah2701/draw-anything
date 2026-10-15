import { describe, expect, it } from "vitest";
import { minimapTransform, toMinimap, toWorld } from "./minimap-math";

const size = { width: 160, height: 110 };

describe("minimap transform", () => {
  const content = { minX: 0, minY: 0, maxX: 4000, maxY: 1000 };
  const viewport = { minX: 500, minY: 200, maxX: 1700, maxY: 900 };

  it("fits the content inside the minimap with padding", () => {
    const t = minimapTransform(content, viewport, size);
    for (const p of [{ x: 0, y: 0 }, { x: 4000, y: 1000 }]) {
      const m = toMinimap(t, p);
      expect(m.x).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(m.x).toBeLessThanOrEqual(152 + 1e-9);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(110);
    }
  });

  it("round-trips world <-> minimap, which is what makes click-to-centre land where it points", () => {
    const t = minimapTransform(content, viewport, size);
    const p = { x: 1234, y: 567 };
    const back = toWorld(t, toMinimap(t, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("keeps the viewport visible when it is far from all content", () => {
    const far = { minX: 50_000, minY: 50_000, maxX: 51_200, maxY: 50_800 };
    const t = minimapTransform(content, far, size);
    const m = toMinimap(t, { x: far.maxX, y: far.maxY });
    expect(m.x).toBeLessThanOrEqual(160);
    expect(m.y).toBeLessThanOrEqual(110);
  });

  it("works with no content, and with degenerate sizes", () => {
    const t = minimapTransform(null, viewport, size);
    expect(Number.isFinite(t.scale) && t.scale > 0).toBe(true);
    const flat = minimapTransform({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { minX: 5, minY: 5, maxX: 5, maxY: 5 }, size);
    expect(Number.isFinite(flat.scale)).toBe(true);
  });
});

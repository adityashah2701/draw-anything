import { describe, expect, it } from "vitest";
import { curveCorners, flattenCurve, roundedCorners } from "@/core/routing/curve";

const z = [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 100 }, { x: 200, y: 100 }];

describe("curveCorners", () => {
  it("has no corners on a straight path", () => {
    expect(curveCorners([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 90, y: 0 }])).toEqual([]);
  });

  it("keeps a straight tail at attached ends and shares a middle segment between two bends", () => {
    const [first, second] = curveCorners(z);
    expect(first.enter).toEqual({ x: 8, y: 0 }); // reach = stub 24 - tail 8 = 16, back from the bend at x=24
    expect(first.exit).toEqual({ x: 24, y: 16 });
    expect(second.enter.y).toBeGreaterThan(first.exit.y);
  });

  it("starts and ends exactly on the connector's ends", () => {
    const flat = flattenCurve(z);
    expect(flat[0]).toEqual(z[0]);
    expect(flat[flat.length - 1]).toEqual(z[3]);
  });

  it("stays within the polyline's box", () => {
    for (const p of flattenCurve(z)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});

describe("roundedCorners", () => {
  it("turns a right angle between two long segments into an arc of the requested reach", () => {
    const [corner] = roundedCorners([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 16);
    expect(corner.enter).toEqual({ x: 84, y: 0 });
    expect(corner.control).toEqual({ x: 100, y: 0 });
    expect(corner.exit).toEqual({ x: 100, y: 16 });
  });

  it("never reaches past half of the shorter neighbouring segment", () => {
    const [corner] = roundedCorners([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }], 16);
    expect(corner.enter).toEqual({ x: 5, y: 0 });
    expect(corner.exit).toEqual({ x: 10, y: 5 });
  });

  it("lets two bends share a short segment without their arcs overlapping", () => {
    const [first, second] = roundedCorners([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 200, y: 20 }], 16);
    expect(first.exit.y).toBeLessThanOrEqual(second.enter.y);
    expect(first.exit).toEqual({ x: 100, y: 10 });
    expect(second.enter).toEqual({ x: 100, y: 10 });
  });

  it("leaves collinear points alone and has no corner for a straight path or a zero radius", () => {
    const corners = roundedCorners([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 16);
    expect(corners).toHaveLength(1);
    expect(corners[0].control).toEqual({ x: 100, y: 0 });
    expect(roundedCorners([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 90, y: 0 }], 16)).toEqual([]);
    expect(roundedCorners([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0)).toEqual([]);
  });
});

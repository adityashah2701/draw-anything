import { describe, expect, it } from "vitest";
import { curveCorners, flattenCurve } from "@/core/routing/curve";

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

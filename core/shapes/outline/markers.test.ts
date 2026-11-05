import { describe, expect, it } from "vitest";
import { MARKER_IDS, isMarkerId, markerOps } from "./markers";

const reach = (ops: ReturnType<typeof markerOps>, cx: number, cy: number) => {
  let far = 0;
  for (const op of ops) {
    if (op.kind === "circle") far = Math.max(far, Math.hypot(op.cx - cx, op.cy - cy) + op.r);
    else for (const c of op.path) if (c[0] !== "Z") far = Math.max(far, Math.hypot(c[1] - cx, c[2] - cy));
  }
  return far;
};

describe("markers", () => {
  it("knows its ids and rejects anything else", () => {
    expect(MARKER_IDS).toEqual(expect.arrayContaining(["envelope", "clock", "cross", "plus", "circle", "pentagon", "asterisk", "dot", "bullseye"]));
    expect(isMarkerId("clock")).toBe(true);
    expect(isMarkerId("smiley")).toBe(false);
    expect(isMarkerId(undefined)).toBe(false);
  });

  it.each(MARKER_IDS)("%s draws something and stays inside the circle of radius r", (id) => {
    const ops = markerOps(id, 50, 40, 20);
    expect(ops.length).toBeGreaterThan(0);
    expect(reach(ops, 50, 40)).toBeLessThanOrEqual(20.01);
    expect(reach(ops, 50, 40)).toBeGreaterThan(8);
  });

  it("fills the dot and the middle of the bullseye, and leaves the ring of the circle unfilled", () => {
    expect(markerOps("dot", 0, 0, 10).some((o) => (o.kind === "circle" ? o.fill : o.kind === "fill"))).toBe(true);
    expect(markerOps("bullseye", 0, 0, 10).filter((o) => o.kind === "circle" && o.fill)).toHaveLength(1);
    expect(markerOps("circle", 0, 0, 10).every((o) => o.kind !== "fill" && !(o.kind === "circle" && o.fill))).toBe(true);
  });

  it("is the same for the same input", () => {
    expect(markerOps("pentagon", 5, 5, 12)).toEqual(markerOps("pentagon", 5, 5, 12));
  });
});

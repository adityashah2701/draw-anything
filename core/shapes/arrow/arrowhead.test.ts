import { describe, expect, it } from "vitest";
import { ARROWHEAD_KINDS, arrowheadOps, headTrim, type HeadOp } from "@/core/shapes/arrow/arrowhead";

const tip = { x: 100, y: 50 };
const right = { x: 1, y: 0 }; // the line arrives travelling right, into the shape
const size = { length: 12, width: 7 };

const strokes = (ops: HeadOp[]) => ops.filter((o) => o.kind === "stroke");
const points = (op: HeadOp) => ("path" in op ? op.path : []);

describe("arrowheadOps", () => {
  it("draws the existing filled triangle for the default kind, tip on the shape edge", () => {
    const ops = arrowheadOps("triangle", tip, right, size);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "fill" });
    expect(points(ops[0])[0]).toEqual(["M", 100, 50]);
  });

  it("draws an open arrow as two strokes meeting at the tip, without a fill", () => {
    const ops = arrowheadOps("open", tip, right, size);
    expect(ops.some((o) => o.kind === "fill")).toBe(false);
    const all = ops.flatMap(points);
    expect(all).toContainEqual(["L", 100, 50]);
    expect(all).toContainEqual(["M", 88, 43]);
  });

  it("draws a crow's-foot many end as three prongs that all touch the shape edge", () => {
    const ops = arrowheadOps("crow-many", tip, right, size);
    const ends = strokes(ops).flatMap((o) => points(o).filter((c) => c[0] === "L").map((c) => [c[1], c[2]]));
    expect(ends).toEqual(expect.arrayContaining([[100, 43], [100, 50], [100, 57]]));
  });

  it("adds a circle for an optional end and a bar for one", () => {
    expect(arrowheadOps("crow-zero-many", tip, right, size).some((o) => o.kind === "circle")).toBe(true);
    expect(arrowheadOps("crow-zero-one", tip, right, size).some((o) => o.kind === "circle")).toBe(true);
    const one = arrowheadOps("crow-one", tip, right, size);
    expect(one.some((o) => o.kind === "circle")).toBe(false);
    expect(strokes(one).length).toBeGreaterThanOrEqual(1);
    expect(strokes(arrowheadOps("crow-exactly-one", tip, right, size))).toHaveLength(2);
  });

  it("turns with the direction of the line, here travelling down", () => {
    const ops = arrowheadOps("crow-many", { x: 10, y: 100 }, { x: 0, y: 1 }, size);
    const ends = strokes(ops).flatMap((o) => points(o).filter((c) => c[0] === "L").map((c) => [c[1], c[2]]));
    expect(ends).toEqual(expect.arrayContaining([[3, 100], [10, 100], [17, 100]]));
  });

  it("knows every kind it advertises", () => {
    for (const kind of ARROWHEAD_KINDS) expect(arrowheadOps(kind, tip, right, size).length).toBeGreaterThan(0);
  });
});

describe("headTrim", () => {
  it("stops the line at the head's base for hollow heads and not for line-ending heads", () => {
    expect(headTrim("hollow-triangle", size)).toBe(12);
    expect(headTrim("diamond", size)).toBeGreaterThan(0);
    expect(headTrim("circle", size)).toBeGreaterThan(0);
    expect(headTrim("triangle", size)).toBe(0);
    expect(headTrim("open", size)).toBe(0);
    expect(headTrim("crow-many", size)).toBe(0);
  });
});

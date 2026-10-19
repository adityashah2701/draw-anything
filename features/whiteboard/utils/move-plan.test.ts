import { describe, expect, it } from "vitest";
import { makeBounds } from "@/core/geometry/box";
import { arrow, boundsOf, rect } from "@/core/groups/test-helpers";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { planFrameScale, planRotation, planShapeMoves, planTransform, uniformOffsets } from "./move-plan";

const noReroute = () => [] as DrawingElement[];
const byId = (list: DrawingElement[], id: string) => list.find((s) => s.id === id)!;

describe("planShapeMoves", () => {
  it("moves each shape by its own offset and leaves the others out", () => {
    const origin = [rect("a", 0, 0), rect("b", 200, 0), rect("c", 400, 0)];
    const out = planShapeMoves(origin, new Map([["a", { dx: 5, dy: 6 }], ["b", { dx: -10, dy: 0 }]]), noReroute);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
    expect(byId(out, "a").points[0]).toEqual({ x: 5, y: 6 });
    expect(byId(out, "b").points[0]).toEqual({ x: 190, y: 0 });
  });

  it("carries a connector rigidly when both ends move by the same amount", () => {
    const origin = [rect("a", 0, 0), rect("b", 200, 0), arrow("ab", "a", "b")];
    const out = planShapeMoves(origin, uniformOffsets(origin, 10, 20), noReroute);
    expect(byId(out, "ab").points[0]).toEqual({ x: 10, y: 20 });
    expect(out).toHaveLength(3);
  });

  it("hands a connector to the router when one end stays behind", () => {
    const origin = [rect("a", 0, 0), arrow("ax", "a", "x")];
    const seen: string[][] = [];
    const out = planShapeMoves(origin, uniformOffsets(origin, 10, 0), (moved) => {
      seen.push(moved.map((s) => s.id));
      return [{ ...arrow("ax", "a", "x"), points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } as DrawingElement];
    });
    expect(seen).toEqual([["a"]]); // the connector was not moved; only the shape reaches the router
    expect(byId(out, "ax").points).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]); // the router's answer is what is written
  });

  it("hands a connector to the router when its ends move by different amounts", () => {
    const origin = [rect("a", 0, 0), rect("b", 200, 0), arrow("ab", "a", "b")];
    const offsets = new Map([["a", { dx: 10, dy: 0 }], ["b", { dx: 50, dy: 0 }], ["ab", { dx: 10, dy: 0 }]]);
    let routed: string[] = [];
    const out = planShapeMoves(origin, offsets, (moved) => {
      routed = moved.map((s) => s.id);
      return [];
    });
    expect(routed.sort()).toEqual(["a", "b"]);
    expect(out.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("does not return a rerouted connector twice if it also moved", () => {
    const origin = [rect("a", 0, 0), rect("b", 200, 0), arrow("ab", "a", "b")];
    const out = planShapeMoves(origin, uniformOffsets(origin, 1, 1), (moved) => moved.filter((s) => s.id === "ab"));
    expect(out.filter((s) => s.id === "ab")).toHaveLength(1);
  });

  it("returns nothing for nothing to move", () => {
    expect(planShapeMoves([], new Map(), noReroute)).toEqual([]);
    expect(planShapeMoves([rect("a", 0, 0)], new Map(), noReroute)).toEqual([]);
  });

  it("starts from the origin every time, so repeated frames do not accumulate", () => {
    const origin = [rect("a", 0, 0)];
    planShapeMoves(origin, uniformOffsets(origin, 99, 99), noReroute);
    expect(planShapeMoves(origin, uniformOffsets(origin, 5, 5), noReroute)[0].points[0]).toEqual({ x: 5, y: 5 });
    expect(origin[0].points[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("planFrameScale", () => {
  it("scales shapes and the connectors between them, and routes the rest", () => {
    const origin = [rect("a", 0, 0, 100, 100), rect("b", 100, 0, 100, 100), arrow("ab", "a", "b"), arrow("out", "b", "elsewhere")];
    let routed: string[] = [];
    const out = planFrameScale(origin, makeBounds(0, 0, 200, 100), makeBounds(0, 0, 400, 200), (changed) => {
      routed = changed.map((s) => s.id);
      return [];
    });
    expect(boundsOf(byId(out, "b"))).toMatchObject({ minX: 200, maxX: 400, minY: 0, maxY: 200 });
    expect(byId(out, "ab").points[1]).toEqual({ x: 100, y: 0 });
    expect(out.map((s) => s.id)).not.toContain("out");
    expect(routed).not.toContain("out");
  });

  it("keeps a turned shape's orientation while scaling", () => {
    const origin = [rect("a", 0, 0, 100, 40, { rotation: 90 })];
    const out = planFrameScale(origin, makeBounds(0, 0, 100, 40), makeBounds(0, 0, 200, 40), noReroute);
    expect(out[0].rotation).toBe(90);
  });
});

describe("planRotation", () => {
  it("turns a group about a pivot, its shapes' own angles included", () => {
    const origin = [rect("a", 0, 0, 100, 50), rect("b", 200, 0, 100, 50)];
    const out = planRotation(origin, { x: 150, y: 25 }, 180, () => null, noReroute);
    expect(out.map((s) => s.rotation)).toEqual([180, 180]);
    expect(boundsOf(byId(out, "a"))).toMatchObject({ minX: 200, maxX: 300 });
    expect(boundsOf(byId(out, "b"))).toMatchObject({ minX: 0, maxX: 100 });
  });

  it("rotates lines by their points and gives text no angle of its own", () => {
    const line = { id: "l", type: "line", color: "#000", strokeWidth: 2, points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] } as DrawingElement;
    const text = { id: "t", type: "text", text: "hi", fontSize: 20, color: "#000", strokeWidth: 1, points: [{ x: 0, y: 0 }] } as DrawingElement;
    const out = planRotation([line, text], { x: 0, y: 0 }, 90, (s) => (s.id === "t" ? makeBounds(0, 0, 20, 10) : null), noReroute);
    expect(byId(out, "l").points[0]).toEqual({ x: 0, y: 10 });
    expect(byId(out, "t").rotation).toBeUndefined();
    expect(byId(out, "t").points[0]).not.toEqual({ x: 0, y: 0 });
  });
});

describe("planTransform", () => {
  it("applies the function to every rigid shape only", () => {
    const origin = [rect("a", 0, 0), arrow("out", "a", "elsewhere")];
    const out = planTransform(origin, (s) => ({ ...s, color: "#f00" }), noReroute);
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });
});

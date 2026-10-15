import { describe, expect, it } from "vitest";
import { bundleFans, type BusEdge } from "./bus";

const box = (id: string, minX: number, minY: number, maxX: number, maxY: number) => ({ id, box: { minX, minY, maxX, maxY } });
// parent bottom handle at (100, 50); children's top handles at y = 200 (entries 24 above).
const down = (id: string, targetId: string, x: number, level: number): BusEdge => ({
  id, sourceId: "p", targetId, fromHandle: "bottom", toHandle: "top",
  points: [{ x: 100, y: 50 }, { x: 100, y: level }, { x: x, y: level }, { x, y: 200 }],
});

describe("bundleFans", () => {
  it("puts sibling edges leaving one side on one shared level (no comb of crossing runs)", () => {
    const edges = [down("a", "c1", 20, 80), down("b", "c2", 100, 95), down("c", "c3", 180, 110)];
    const out = bundleFans(edges, []);
    const levels = edges.map((e) => out.get(e.id)![1].y);
    expect(new Set(levels).size).toBe(1);
    expect(levels[0]).toBe(125); // halfway to the nearest child
    edges.forEach((e) => {
      const p = out.get(e.id)!;
      expect(p[0]).toEqual(e.points[0]);
      expect(p[p.length - 1]).toEqual(e.points[3]);
    });
  });

  it("also bundles edges converging on one side", () => {
    const inEdge = (id: string, x: number, level: number): BusEdge => ({
      id, sourceId: `s${id}`, targetId: "t", fromHandle: "bottom", toHandle: "top",
      points: [{ x, y: 0 }, { x, y: level }, { x: 100, y: level }, { x: 100, y: 200 }],
    });
    const out = bundleFans([inEdge("a", 20, 40), inEdge("b", 180, 60)], []);
    expect(out.get("a")![1].y).toBe(out.get("b")![1].y);
    expect(out.get("a")![1].y).toBe(100); // halfway between the sources' sides (0) and the target (200)
  });

  it("leaves a single edge alone", () => {
    const e = down("a", "c1", 20, 80);
    expect(bundleFans([e], []).get("a")).toEqual(e.points);
  });

  it("does not bundle an edge whose bus path would cross another node", () => {
    const edges = [down("a", "c1", 20, 80), down("b", "c2", 180, 95), down("c", "c3", 100, 110)];
    // an unrelated node sitting on the shared level between x=0..60 blocks edge "a" only
    const out = bundleFans(edges, [box("blocker", 0, 110, 60, 140)]);
    expect(out.get("a")).toEqual(edges[0].points);
    expect(out.get("b")![1].y).toBe(out.get("c")![1].y);
  });

  it("ignores edges whose handles are not opposite each other", () => {
    const e: BusEdge = { ...down("a", "c1", 20, 80), toHandle: "left" };
    const f: BusEdge = { ...down("b", "c2", 180, 95), toHandle: "left" };
    const out = bundleFans([e, f], []);
    expect(out.get("a")).toEqual(e.points);
    expect(out.get("b")).toEqual(f.points);
  });
});

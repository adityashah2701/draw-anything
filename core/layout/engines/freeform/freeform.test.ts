import { describe, expect, it } from "vitest";
import { freeformEngine } from "./index";
import type { LayoutGraph, LayoutRequest, PlacedNode } from "../../types";

const node = (id: string, w = 100, h = 60) => ({ id, width: w, height: h });
const request = (graph: LayoutGraph, placed: Record<string, PlacedNode>, extra: Partial<LayoutRequest<{ gap: number }>> = {}): LayoutRequest<{ gap: number }> => ({
  graph,
  algorithm: "keep",
  params: { gap: 40 },
  mode: "adjust",
  positions: new Map(Object.entries(placed)),
  seed: 1,
  budget: { maxMs: 1000 },
  ...extra,
});

describe("the freeform engine", () => {
  const graph: LayoutGraph = { nodes: [node("a"), node("b"), node("c")], edges: [{ id: "ab", from: "a", to: "b" }, { id: "ac", from: "a", to: "c" }], containers: [] };

  it("moves nothing that has a position, whatever the mode", () => {
    for (const mode of ["preserve", "adjust", "overwrite"] as const) {
      const result = freeformEngine.layout(request(graph, { a: { x: 0, y: 0, source: "auto" }, b: { x: 300, y: 0, source: "user" }, c: { x: 600, y: 0, source: "locked" } }, { mode }));
      expect(result.positions.size).toBe(0);
      expect(result.moved).toEqual([]);
    }
  });

  it("puts a new node beside the node it connects to, clear of everything", () => {
    const result = freeformEngine.layout(request(graph, { a: { x: 0, y: 0, source: "user" }, b: { x: 300, y: 0, source: "user" } }));
    const c = result.positions.get("c")!;
    expect(result.moved).toEqual(["c"]);
    // Not on top of a or b, and at least the gap away from both.
    const clear = (x: number, y: number) => c.x >= x + 100 + 40 || c.x + 100 + 40 <= x || c.y >= y + 60 + 40 || c.y + 60 + 40 <= y;
    expect(clear(0, 0)).toBe(true);
    expect(clear(300, 0)).toBe(true);
    // Near its neighbour: within a few node widths of a.
    expect(Math.hypot(c.x - 0, c.y - 0)).toBeLessThan(500);
  });

  it("places several new nodes without overlap, deterministically", () => {
    const many: LayoutGraph = { nodes: [node("a"), ...Array.from({ length: 6 }, (_, i) => node(`n${i}`))], edges: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, from: "a", to: `n${i}` })), containers: [] };
    const run = () => freeformEngine.layout(request(many, { a: { x: 0, y: 0, source: "user" } }));
    const first = run();
    expect([...first.positions]).toEqual([...run().positions]);
    const rects = [...first.positions].map(([id, p]) => ({ id, ...p }));
    for (let i = 0; i < rects.length; i += 1) {
      expect(rects[i].x < 100 + 40 && rects[i].y < 60 + 40 && rects[i].x > -100 - 40 && rects[i].y > -60 - 40, "clear of a").toBe(false);
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        expect(a.x < b.x + 100 && a.x + 100 > b.x && a.y < b.y + 60 && a.y + 60 > b.y, `${a.id} and ${b.id} overlap`).toBe(false);
      }
    }
  });

  it("keeps out of a forbidden region", () => {
    const result = freeformEngine.layout(request(graph, { a: { x: 0, y: 0, source: "user" }, b: { x: 300, y: 0, source: "user" } }, { constraints: [{ kind: "region", rect: { minX: 100, minY: -400, maxX: 2000, maxY: 400 } }] }));
    const c = result.positions.get("c")!;
    const inside = c.x < 2000 && c.x + 100 > 100 && c.y < 400 && c.y + 60 > -400;
    expect(inside).toBe(false);
  });

  it("places the first node of an empty board, and a loose node below the drawing", () => {
    expect(freeformEngine.layout(request({ nodes: [node("a")], edges: [], containers: [] }, {})).positions.get("a")).toEqual({ x: 0, y: 0 });
    const loose = freeformEngine.layout(request({ nodes: [node("a"), node("z")], edges: [], containers: [] }, { a: { x: 0, y: 0, source: "user" } }));
    expect(loose.positions.get("z")!.y).toBeGreaterThanOrEqual(60);
  });
});

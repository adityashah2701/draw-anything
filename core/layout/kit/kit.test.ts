import { describe, expect, it } from "vitest";
import { affectedSet, diffGraphs } from "./diff";
import { enforceFixed, fixedIds, isFixedIn } from "./fixed";
import { findFreeSlot } from "./free-slot";
import { rectAt } from "./rect";
import { computeStats } from "./stats";
import type { LayoutGraph, LayoutMode, LayoutRequest, PlacedNode } from "../types";

const n = (id: string, w = 100, h = 60) => ({ id, width: w, height: h });
const graph = (ids: string[], edges: Array<[string, string]> = []): LayoutGraph => ({ nodes: ids.map((id) => n(id)), edges: edges.map(([from, to], i) => ({ id: `e${i}`, from, to })), containers: [] });
const req = (g: LayoutGraph, placed: Record<string, PlacedNode>, mode: LayoutMode): Pick<LayoutRequest, "graph" | "positions" | "mode"> => ({ graph: g, positions: new Map(Object.entries(placed)), mode });

describe("which nodes an operation may not move", () => {
  it("never moves locked; preserve moves nothing; adjust moves only auto; overwrite moves all but locked", () => {
    const table: Array<[LayoutMode, "auto" | "user" | "locked", boolean]> = [
      ["preserve", "auto", true], ["preserve", "user", true], ["preserve", "locked", true],
      ["adjust", "auto", false], ["adjust", "user", true], ["adjust", "locked", true],
      ["overwrite", "auto", false], ["overwrite", "user", false], ["overwrite", "locked", true],
    ];
    for (const [mode, source, fixed] of table) expect(isFixedIn(mode, source), `${mode} ${source}`).toBe(fixed);
  });

  it("lists the fixed ids of a request, and treats a node with no position as free", () => {
    const r = req(graph(["a", "b", "c", "d"]), { a: { x: 0, y: 0, source: "auto" }, b: { x: 0, y: 0, source: "user" }, c: { x: 0, y: 0, source: "locked" } }, "adjust");
    expect([...fixedIds(r)].sort()).toEqual(["b", "c"]);
  });
});

describe("the guard after an engine", () => {
  const r = req(graph(["a", "b", "c"]), { a: { x: 0, y: 0, source: "auto" }, b: { x: 200, y: 0, source: "user" }, c: { x: 400, y: 0, source: "locked" } }, "adjust");

  it("discards a move of a fixed node, names it, and keeps the rest", () => {
    const out = enforceFixed(r, { positions: new Map([["a", { x: 5, y: 5 }], ["b", { x: 9, y: 9 }], ["c", { x: 1, y: 1 }]]), moved: ["a", "b", "c"], unplaced: [], diagnostics: [] });
    expect(out.violations.sort()).toEqual(["b", "c"]);
    expect([...out.result.positions.keys()]).toEqual(["a"]);
    expect(out.result.moved).toEqual(["a"]);
    expect(out.result.diagnostics[0]).toMatchObject({ severity: "error", code: "layout/fixed-moved" });
  });

  it("returns the very same result when nothing fixed was touched", () => {
    const clean = { positions: new Map([["a", { x: 5, y: 5 }]]), moved: ["a"], unplaced: [], diagnostics: [] };
    const out = enforceFixed(r, clean);
    expect(out.violations).toEqual([]);
    expect(out.result).toBe(clean);
  });
});

describe("what changed between two graphs", () => {
  const before = graph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
  const after: LayoutGraph = { nodes: [n("a"), n("b", 140), n("d")], edges: [{ id: "x1", from: "a", to: "b" }, { id: "x2", from: "b", to: "d" }], containers: [] };

  it("finds added, removed, resized and changed edges by stable id", () => {
    const delta = diffGraphs(before, after);
    expect(delta.added).toEqual(["d"]);
    expect(delta.removed).toEqual(["c"]);
    expect(delta.resized).toEqual(["b"]);
    expect(delta.changedEdges.sort()).toEqual(["e1", "x2"].sort());
  });

  it("builds the affected set: the delta and its one-hop neighbours, nothing further", () => {
    const delta = diffGraphs(before, after);
    expect([...affectedSet(delta, after, before)].sort()).toEqual(["a", "b", "d"]);
    const long = graph(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]]);
    const plus: LayoutGraph = { ...long, nodes: [...long.nodes, n("f")], edges: [...long.edges, { id: "e9", from: "e", to: "f" }] };
    expect([...affectedSet(diffGraphs(long, plus), plus, long)].sort()).toEqual(["d", "e", "f"]); // f is new, e is its neighbour, d is e's neighbour: one hop from the changed edge, no further
  });
});

describe("the free place nearest to where something is wanted", () => {
  it("returns the ideal when it is free and the nearest free place when it is not", () => {
    const wall = [rectAt(0, 0, { width: 100, height: 60 })];
    expect(findFreeSlot({ x: 400, y: 0 }, { width: 100, height: 60 }, wall, 20)).toEqual({ x: 400, y: 0 });
    const slot = findFreeSlot({ x: 0, y: 0 }, { width: 100, height: 60 }, wall, 20)!;
    const placed = rectAt(slot.x, slot.y, { width: 100, height: 60 });
    expect(placed.minX < 100 + 20 && placed.maxX > -20 && placed.minY < 60 + 20 && placed.maxY > -20).toBe(false);
    expect(Math.hypot(slot.x, slot.y)).toBeLessThan(200);
  });

  it("is deterministic, avoids forbidden regions and gives up only when nothing is free", () => {
    const a = findFreeSlot({ x: 0, y: 0 }, { width: 50, height: 50 }, [rectAt(0, 0, { width: 50, height: 50 })], 10);
    expect(findFreeSlot({ x: 0, y: 0 }, { width: 50, height: 50 }, [rectAt(0, 0, { width: 50, height: 50 })], 10)).toEqual(a);
    expect(findFreeSlot({ x: 0, y: 0 }, { width: 50, height: 50 }, [], 10, 10, [{ minX: -10_000, minY: -10_000, maxX: 10_000, maxY: 10_000 }])).toBeNull();
  });
});

describe("the numbers of a layout", () => {
  it("counts moved nodes, held-fixed nodes, displacement, order kept and overlaps", () => {
    const r = req(graph(["a", "b", "c"]), { a: { x: 0, y: 0, source: "auto" }, b: { x: 200, y: 0, source: "auto" }, c: { x: 400, y: 0, source: "user" } }, "adjust");
    const stats = computeStats(r, { positions: new Map([["a", { x: 30, y: 0 }], ["b", { x: 200, y: 0 }]]) });
    expect(stats).toMatchObject({ nodes: 3, moved: 1, heldFixed: 1, maxDisplacement: 30, overlaps: 0, orderPreserved: 1 });
    const swapped = computeStats(r, { positions: new Map([["a", { x: 300, y: 0 }]]) });
    expect(swapped.orderPreserved).toBeLessThan(1);
    expect(computeStats(r, { positions: new Map([["a", { x: 200, y: 0 }]]) }).overlaps).toBe(1);
  });
});

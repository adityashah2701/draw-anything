import { describe, expect, it } from "vitest";
import { separateGroups } from "./group-separation";
import { placeGrid } from "./grid-placement";
import { findComponents, placeLayered } from "./layered-placement";
import { withPins } from "./pins";
import type { Placement, PlacementInput } from "./types";

const node = (id: string, depth: number, extra: Partial<PlacementInput["nodes"][number]> = {}) => ({ id, depth, width: 168, height: 78, ...extra });
const input = (over: Partial<PlacementInput>): PlacementInput => ({
  nodes: [], edges: [], groups: [], gaps: { horizontal: 78, vertical: 60, groupRoom: 0 }, ...over,
});
const rect = (p: Placement, i: PlacementInput, id: string) => {
  const at = p.get(id)!;
  const n = i.nodes.find((x) => x.id === id)!;
  return { minX: at.x, maxX: at.x + n.width, minY: at.y, maxY: at.y + n.height };
};
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
const noOverlaps = (p: Placement, i: PlacementInput) =>
  i.nodes.every((a, k) => i.nodes.slice(k + 1).every((b) => !overlap(rect(p, i, a.id), rect(p, i, b.id))));

describe("findComponents", () => {
  const i = input({
    nodes: [node("a", 0), node("b", 1), node("c", 0), node("d", 0), node("e", 1)],
    edges: [{ from: "a", to: "b" }, { from: "d", to: "e" }],
    groups: [{ id: "g", nodeIds: ["c", "e"] }],
  });

  it("separates unconnected parts, largest first", () => {
    const comps = findComponents(input({ nodes: i.nodes, edges: i.edges }));
    expect(comps.map((c) => c.sort())).toEqual([["a", "b"], ["d", "e"], ["c"]]);
  });

  it("treats members of one group as one component so a frame can hold them", () => {
    const comps = findComponents(i).map((c) => c.sort());
    expect(comps).toContainEqual(["c", "d", "e"]);
  });
});

describe("placeLayered", () => {
  it("lays disconnected components side by side in their own bands, without overlap", () => {
    const i = input({
      nodes: [node("a", 0), node("b", 1), node("x", 0), node("y", 1)],
      edges: [{ from: "a", to: "b" }, { from: "x", to: "y" }],
    });
    const p = placeLayered(i);
    expect(noOverlaps(p, i)).toBe(true);
    const bandA = [rect(p, i, "a"), rect(p, i, "b")];
    const bandX = [rect(p, i, "x"), rect(p, i, "y")];
    const aRight = Math.max(...bandA.map((r) => r.maxX));
    const xLeft = Math.min(...bandX.map((r) => r.minX));
    const xRight = Math.max(...bandX.map((r) => r.maxX));
    const aLeft = Math.min(...bandA.map((r) => r.minX));
    expect(aRight <= xLeft || xRight <= aLeft).toBe(true);
  });

  it("gives rows of mixed heights a constant gap and never overlaps them", () => {
    const i = input({
      nodes: [node("a", 0, { height: 78 }), node("b", 0, { height: 140 }), node("c", 1, { height: 100 })],
      edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }],
    });
    const p = placeLayered(i);
    expect(noOverlaps(p, i)).toBe(true);
    const rowBottom = Math.max(rect(p, i, "a").maxY, rect(p, i, "b").maxY);
    expect(rect(p, i, "c").minY - rowBottom).toBeCloseTo(60, 5);
  });

  it("reserves room between same-row neighbours joined by a wide label", () => {
    const plain = placeLayered(input({ nodes: [node("a", 0), node("b", 0)], edges: [{ from: "a", to: "b" }] }));
    const labelled = placeLayered(input({ nodes: [node("a", 0), node("b", 0)], edges: [{ from: "a", to: "b", labelWidth: 200 }] }));
    const gap = (p: Placement) => Math.abs(p.get("b")!.x - p.get("a")!.x) - 168;
    expect(gap(labelled)).toBeGreaterThanOrEqual(200 + 24 - 1e-6);
    expect(gap(plain)).toBeLessThan(gap(labelled));
  });

  it("is deterministic", () => {
    const i = input({ nodes: [node("a", 0), node("b", 1), node("c", 1), node("d", 2)], edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }] });
    expect([...placeLayered(i)]).toEqual([...placeLayered(i)]);
  });
});

describe("separateGroups", () => {
  it("moves a node that sits inside a group's frame out of it", () => {
    // g spans two rows (a above, c below); stranger b sits between them in the x-range
    const i = input({
      nodes: [node("a", 0), node("b", 0), node("c", 1)],
      edges: [{ from: "a", to: "c" }],
      groups: [{ id: "g", nodeIds: ["a", "c"] }],
    });
    const before: Placement = new Map([["a", { x: 0, y: 0 }], ["b", { x: 200, y: 0 }], ["c", { x: 150, y: 140 }]]);
    const after = separateGroups(before, i);
    const frame = { minX: Math.min(...["a", "c"].map((id) => rect(after, i, id).minX)), maxX: Math.max(...["a", "c"].map((id) => rect(after, i, id).maxX)), minY: 0, maxY: 218 };
    expect(overlap(rect(after, i, "b"), frame)).toBe(false);
    expect(after.get("a")).toEqual(before.get("a")); // members stay
    expect(noOverlaps(after, i)).toBe(true);
  });

  it("leaves a layout alone when no frame is invaded", () => {
    const i = input({ nodes: [node("a", 0), node("b", 0)], groups: [{ id: "g", nodeIds: ["a", "b"] }] });
    const p: Placement = new Map([["a", { x: 0, y: 0 }], ["b", { x: 300, y: 0 }]]);
    expect(separateGroups(p, i)).toEqual(p);
  });

  it("terminates when two groups interleave and cannot both be satisfied", () => {
    const i = input({
      nodes: [node("a1", 0), node("b1", 0), node("a2", 1), node("b2", 1)],
      groups: [{ id: "ga", nodeIds: ["a1", "a2"] }, { id: "gb", nodeIds: ["b1", "b2"] }],
    });
    const p: Placement = new Map([["a1", { x: 0, y: 0 }], ["b1", { x: 300, y: 0 }], ["a2", { x: 300, y: 140 }], ["b2", { x: 0, y: 140 }]]);
    const out = separateGroups(p, i);
    expect(out.size).toBe(4);
    expect(noOverlaps(out, i)).toBe(true);
  });
});

describe("withPins", () => {
  const i = input({
    nodes: [node("a", 0), node("b", 1), node("c", 1)],
    edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }],
  });

  it("keeps a pinned node's centre exactly where the user put it", () => {
    const p = withPins(placeLayered, new Map([["b", { x: 700, y: 500 }]]))(i);
    expect(p.get("b")!.x + 84).toBe(700);
    expect(p.get("b")!.y + 39).toBe(500);
  });

  it("moves other nodes off a pinned node instead of overlapping it", () => {
    const base = placeLayered(i);
    const onC = { x: base.get("c")!.x + 84, y: base.get("c")!.y + 39 };
    const p = withPins(placeLayered, new Map([["b", onC]]))(i); // pin b on top of where c would go
    expect(noOverlaps(p, i)).toBe(true);
    expect(p.get("b")!.x + 84).toBe(onC.x);
  });

  it("ignores pins for nodes that no longer exist and returns the plain layout when none apply", () => {
    expect([...withPins(placeLayered, new Map([["ghost", { x: 1, y: 2 }]]))(i)]).toEqual([...placeLayered(i)]);
  });

  it("is deterministic", () => {
    const pins = new Map([["b", { x: 700, y: 500 }], ["c", { x: 720, y: 520 }]]);
    expect([...withPins(placeLayered, pins)(i)]).toEqual([...withPins(placeLayered, pins)(i)]);
  });
});

describe("placeGrid (the fallback)", () => {
  it("places any graph without overlap, deterministically, including an empty one", () => {
    const nodes = Array.from({ length: 11 }, (_, k) => node(`n${k}`, 0, { width: 120 + k * 10, height: 60 + k * 5 }));
    const i = input({ nodes });
    const p = placeGrid(i);
    expect(p.size).toBe(11);
    expect(noOverlaps(p, i)).toBe(true);
    expect([...placeGrid(i)]).toEqual([...p]);
    expect(placeGrid(input({})).size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  assignCenters,
  countCrossings,
  orderRows,
  type LayoutEdge,
  type LayoutNode,
} from "@/features/ai/server/layout/layered-order";

const node = (id: string, depth: number, extra: Partial<LayoutNode> = {}): LayoutNode => ({
  id,
  depth,
  width: 100,
  ...extra,
});
const rowsOf = (nodes: LayoutNode[]) => {
  const rows = new Map<number, string[]>();
  nodes.forEach((n) => rows.set(n.depth, [...(rows.get(n.depth) ?? []), n.id]));
  return rows;
};

describe("countCrossings", () => {
  const nodes = [node("a", 0), node("b", 0), node("c", 1), node("d", 1)];

  it("is 0 for parallel edges and 1 for an X", () => {
    const rows = rowsOf(nodes);
    expect(countCrossings(rows, nodes, [{ from: "a", to: "c" }, { from: "b", to: "d" }])).toBe(0);
    expect(countCrossings(rows, nodes, [{ from: "a", to: "d" }, { from: "b", to: "c" }])).toBe(1);
  });

  it("ignores same-row edges, shared endpoints and edges to unknown nodes", () => {
    const rows = rowsOf(nodes);
    expect(
      countCrossings(rows, nodes, [
        { from: "a", to: "b" }, // same row
        { from: "a", to: "c" },
        { from: "a", to: "d" }, // shares endpoint a
        { from: "a", to: "zzz" }, // unknown
      ]),
    ).toBe(0);
  });
});

describe("orderRows", () => {
  // Labels sort alphabetically a<b<c<d<e<f, but the edges pair them in reverse,
  // which is the worst case for the previous label-sorted layout.
  const nodes = [
    node("a", 0), node("b", 0), node("c", 0),
    node("x", 1), node("y", 1), node("z", 1),
  ];
  const edges: LayoutEdge[] = [
    { from: "a", to: "z" },
    { from: "b", to: "y" },
    { from: "c", to: "x" },
  ];

  it("removes crossings that the initial order has", () => {
    const initial = rowsOf(nodes);
    expect(countCrossings(initial, nodes, edges)).toBe(3);
    const ordered = orderRows(nodes, edges);
    expect(countCrossings(ordered, nodes, edges)).toBe(0);
  });

  it("never makes the layout worse than the order it was given", () => {
    // Deterministic pseudo-random layered graphs.
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let trial = 0; trial < 25; trial += 1) {
      const depths = 4;
      const ns: LayoutNode[] = Array.from({ length: 18 }, (_, i) =>
        node(`n${i}`, Math.floor(rand() * depths)),
      );
      const es: LayoutEdge[] = [];
      for (let i = 0; i < 28; i += 1) {
        const a = ns[Math.floor(rand() * ns.length)];
        const b = ns[Math.floor(rand() * ns.length)];
        if (a.id !== b.id) es.push({ from: a.id, to: b.id });
      }
      const before = countCrossings(rowsOf(ns), ns, es);
      const after = countCrossings(orderRows(ns, es), ns, es);
      expect(after).toBeLessThanOrEqual(before);
    }
  });

  it("places every node exactly once, even with cycles and isolated nodes", () => {
    const ns = [node("a", 0), node("b", 1), node("c", 2), node("lonely", 1)];
    const es: LayoutEdge[] = [
      { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }, // cycle
    ];
    const ordered = orderRows(ns, es);
    expect([...ordered.values()].flat().sort()).toEqual(["a", "b", "c", "lonely"]);
  });

  it("handles empty input", () => {
    expect(orderRows([], []).size).toBe(0);
  });

  it("keeps the members of a group next to each other", () => {
    const ns = [
      node("p1", 0, { cluster: "backend" }),
      node("q", 0),
      node("p2", 0, { cluster: "backend" }),
      node("r", 0),
      node("p3", 0, { cluster: "backend" }),
      node("t", 1),
    ];
    const es: LayoutEdge[] = [
      { from: "q", to: "t" }, { from: "r", to: "t" }, { from: "p1", to: "t" },
    ];
    const row = orderRows(ns, es).get(0)!;
    const positions = ["p1", "p2", "p3"].map((id) => row.indexOf(id)).sort((a, b) => a - b);
    expect(positions[2] - positions[0]).toBe(2);
  });

  it("is deterministic", () => {
    const first = [...orderRows(nodes, edges).entries()];
    const second = [...orderRows(nodes, edges).entries()];
    expect(second).toEqual(first);
  });

  it("is fast enough for the largest allowed diagram", () => {
    const ns: LayoutNode[] = Array.from({ length: 40 }, (_, i) => node(`n${i}`, i % 5));
    const es: LayoutEdge[] = Array.from({ length: 80 }, (_, i) => ({
      from: `n${i % 40}`,
      to: `n${(i * 7 + 3) % 40}`,
    }));
    const start = performance.now();
    orderRows(ns, es);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("assignCenters", () => {
  const gap = 40;
  const overlap = (centers: Map<string, number>, row: string[], width: number) => {
    const xs = row.map((id) => centers.get(id)!).sort((a, b) => a - b);
    return xs.some((x, i) => i > 0 && x - xs[i - 1] < width + gap - 0.001);
  };

  it("never overlaps nodes in a row", () => {
    const ns = [node("a", 0), node("b", 0), node("c", 0), node("d", 1), node("e", 1)];
    const es: LayoutEdge[] = [
      { from: "a", to: "d" }, { from: "b", to: "d" }, { from: "c", to: "d" }, { from: "c", to: "e" },
    ];
    const rows = orderRows(ns, es);
    const centers = assignCenters(rows, ns, es, { gap, centerX: 500 });
    for (const row of rows.values()) expect(overlap(centers, row, 100)).toBe(false);
  });

  it("puts a lone child under its parent and a parent over its two children", () => {
    const ns = [node("p", 0), node("c1", 1), node("c2", 1), node("g", 2)];
    const es: LayoutEdge[] = [
      { from: "p", to: "c1" }, { from: "p", to: "c2" }, { from: "c1", to: "g" },
    ];
    const rows = orderRows(ns, es);
    const centers = assignCenters(rows, ns, es, { gap, centerX: 500 });
    expect(centers.get("p")).toBeCloseTo(
      ((centers.get("c1") as number) + (centers.get("c2") as number)) / 2,
      0,
    );
    expect(centers.get("g")).toBeCloseTo(centers.get("c1") as number, 0);
  });

  it("is deterministic and keeps the left-to-right order", () => {
    const ns = [node("a", 0), node("b", 0), node("c", 1)];
    const es: LayoutEdge[] = [{ from: "a", to: "c" }, { from: "b", to: "c" }];
    const rows = orderRows(ns, es);
    const one = assignCenters(rows, ns, es, { gap, centerX: 500 });
    const two = assignCenters(rows, ns, es, { gap, centerX: 500 });
    expect([...one.entries()]).toEqual([...two.entries()]);
    const row = rows.get(0)!;
    expect((one.get(row[0]) as number) < (one.get(row[1]) as number)).toBe(true);
  });
});

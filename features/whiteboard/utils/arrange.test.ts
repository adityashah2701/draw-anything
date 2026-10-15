import { describe, expect, it } from "vitest";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { alignOffsets, cloneElements, collectCopySet, distributeOffsets, reorder } from "./arrange";

const box = (id: string, x: number, y: number, w: number, h: number) => ({
  id,
  bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h } satisfies Bounds,
});

describe("alignOffsets", () => {
  const items = [box("a", 0, 0, 100, 40), box("b", 50, 100, 60, 80), box("c", 200, 30, 20, 20)];
  it("aligns to the selection edges and centres", () => {
    expect(alignOffsets(items, "left").get("c")).toEqual({ dx: -200, dy: 0 });
    expect(alignOffsets(items, "right").get("a")).toEqual({ dx: 120, dy: 0 });
    expect(alignOffsets(items, "top").get("b")).toEqual({ dx: 0, dy: -100 });
    expect(alignOffsets(items, "bottom").get("a")).toEqual({ dx: 0, dy: 140 });
    expect(alignOffsets(items, "center").get("a")).toEqual({ dx: 60, dy: 0 }); // selection spans 0-220 (centre 110); a is centred on 50
  });
  it("needs two elements", () => expect(alignOffsets([items[0]], "left").size).toBe(0));
});

describe("distributeOffsets", () => {
  it("equalises the gaps and keeps the outer two in place", () => {
    const items = [box("a", 0, 0, 10, 10), box("b", 15, 0, 30, 10), box("c", 100, 0, 20, 10)];
    const offsets = distributeOffsets(items, "horizontal");
    expect(offsets.get("a")).toEqual({ dx: 0, dy: 0 });
    expect(offsets.get("c")).toEqual({ dx: 0, dy: 0 });
    // span 120, widths 60, gap 30 -> b starts at 10+30 = 40
    expect(offsets.get("b")).toEqual({ dx: 25, dy: 0 });
  });
  it("works vertically and ignores input order", () => {
    const items = [box("c", 0, 90, 10, 10), box("a", 0, 0, 10, 10), box("b", 0, 20, 10, 10)];
    expect(distributeOffsets(items, "vertical").get("b")).toEqual({ dx: 0, dy: 25 });
  });
  it("needs three elements", () => expect(distributeOffsets([box("a", 0, 0, 1, 1), box("b", 5, 0, 1, 1)], "horizontal").size).toBe(0));
});

describe("reorder", () => {
  const order = ["a", "b", "c", "d", "e"];
  it("front/back keep the selection's relative order", () => {
    expect(reorder(order, new Set(["b", "d"]), "front")).toEqual(["a", "c", "e", "b", "d"]);
    expect(reorder(order, new Set(["b", "d"]), "back")).toEqual(["b", "d", "a", "c", "e"]);
  });
  it("forward/backward move one step past the neighbour", () => {
    expect(reorder(order, new Set(["b"]), "forward")).toEqual(["a", "c", "b", "d", "e"]);
    expect(reorder(order, new Set(["d"]), "backward")).toEqual(["a", "b", "d", "c", "e"]);
  });
  it("a selected block at the end stays when sent forward, and is a permutation always", () => {
    expect(reorder(order, new Set(["d", "e"]), "forward")).toEqual(order);
    const out = reorder(order, new Set(["a", "c", "e"]), "forward");
    expect([...out].sort()).toEqual([...order].sort());
  });
});

const node = (id: string, x: number): DrawingElement =>
  ({ id, type: "semantic-node", points: [{ x, y: 0 }, { x: x + 100, y: 50 }], color: "#000", strokeWidth: 2, label: id, ai: { semanticId: id, frameId: "f", generationId: "g", semanticKind: "database", icon: "postgres", role: "node" } }) as DrawingElement;
const arrow = (id: string, from: string, to: string, semanticId?: string): DrawingElement =>
  ({ id, type: "arrow", points: [{ x: 100, y: 25 }, { x: 200, y: 25 }], color: "#000", strokeWidth: 2, startConnection: { elementId: from }, endConnection: { elementId: to }, ai: semanticId ? { semanticId, role: "edge" } : undefined }) as unknown as DrawingElement;

describe("copy and clone", () => {
  const label = { id: "lbl", type: "text", points: [{ x: 120, y: 10 }], color: "#000", strokeWidth: 1, text: "x", ai: { semanticId: "e1-label", role: "edge-label" } } as unknown as DrawingElement;
  const all = [node("a", 0), node("b", 200), node("c", 400), arrow("e1", "a", "b", "e1"), arrow("e2", "b", "c", "e2"), label];

  it("includes connectors (and their labels) only when both ends are copied", () => {
    const set = collectCopySet(all, new Set(["a", "b"])).map((e) => e.id);
    expect(set).toEqual(["a", "b", "e1", "lbl"]);
    expect(collectCopySet(all, new Set(["a"])).map((e) => e.id)).toEqual(["a"]);
  });

  it("gives fresh ids, offsets points, remaps connections, and drops generation identity", () => {
    let n = 0;
    const copies = cloneElements(collectCopySet(all, new Set(["a", "b"])), { dx: 20, dy: 30 }, () => `new${++n}`);
    expect(copies.map((c) => c.id)).toEqual(["new1", "new2", "new3", "new4"]);
    expect(copies[0].points[0]).toEqual({ x: 20, y: 30 });
    const e = copies[2] as unknown as { startConnection: { elementId: string }; endConnection: { elementId: string } };
    expect(e.startConnection.elementId).toBe("new1");
    expect(e.endConnection.elementId).toBe("new2");
    expect(copies[0].ai).toEqual({ semanticKind: "database", icon: "postgres", role: "node" });
    expect(all[0].points[0]).toEqual({ x: 0, y: 0 }); // original untouched
  });

  it("drops a connection to something that was not copied", () => {
    const copies = cloneElements([arrow("e2", "b", "c")], { dx: 0, dy: 0 }, () => "n");
    expect((copies[0] as unknown as { startConnection?: unknown }).startConnection).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { estimateTextWidth } from "@/core/text/estimate";
import { overlaps, pathHitsBox, type Box } from "./geometry";
import { placeEdgeLabels, EDGE_LABEL_FONT_SIZE } from "./edge-labels";

const H = (y: number, x1: number, x2: number) => [{ x: x1, y }, { x: x2, y }];
const width = (text: string) => estimateTextWidth(text, EDGE_LABEL_FONT_SIZE, "500");

describe("placeEdgeLabels", () => {
  it("puts a label beside its own connector, clear of it", () => {
    const path = H(100, 0, 300);
    const [placed] = placeEdgeLabels([{ id: "e", text: "HTTPS", points: path }], [], new Map([["e", path]]));
    expect(placed.collides).toBe(false);
    expect(pathHitsBox(path, placed.box)).toBe(false);
    expect(Math.abs((placed.box.minX + placed.box.maxX) / 2 - 150)).toBeLessThan(80);
  });

  it("keeps labels off nodes and off each other", () => {
    const pathA = H(100, 0, 400);
    const pathB = H(100, 0, 400); // same line: both labels want the same spot
    const node: Box = { minX: 150, minY: 60, maxX: 250, maxY: 98 }; // just above the line, middle
    const placed = placeEdgeLabels(
      [{ id: "a", text: "first label", points: pathA }, { id: "b", text: "second label", points: pathB }],
      [node],
      new Map([["a", pathA], ["b", pathB]]),
    );
    expect(overlaps(placed[0].box, node)).toBe(false);
    expect(overlaps(placed[1].box, node)).toBe(false);
    expect(overlaps(placed[0].box, placed[1].box)).toBe(false);
  });

  it("avoids other connectors when a clean spot exists", () => {
    const own = H(100, 0, 300);
    const other = H(88, 0, 300); // runs just above: the 'above' spots are crossed
    const [placed] = placeEdgeLabels([{ id: "e", text: "yes", points: own }], [], new Map([["e", own], ["o", other]]));
    expect(pathHitsBox(other, placed.box)).toBe(false);
    expect(placed.collides).toBe(false);
  });

  it("reports a label that cannot be placed cleanly instead of silently overlapping", () => {
    const path = H(100, 0, 60);
    // boxes all around the short connector: nothing is free within reach
    const walls: Box[] = [{ minX: -500, minY: -500, maxX: 500, maxY: 500 }];
    const [placed] = placeEdgeLabels([{ id: "e", text: "stuck", points: path }], walls, new Map([["e", path]]));
    expect(placed.collides).toBe(true);
    expect(placed.box.maxX - placed.box.minX).toBeCloseTo(Math.ceil(width("stuck")), 0);
  });

  it("is deterministic and handles a degenerate zero-length edge", () => {
    const flat = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
    const a = placeEdgeLabels([{ id: "e", text: "x", points: flat }], [], new Map([["e", flat]]));
    const b = placeEdgeLabels([{ id: "e", text: "x", points: flat }], [], new Map([["e", flat]]));
    expect(a).toEqual(b);
    expect(a[0].collides).toBe(true);
  });

  it("leaves room for a label wider than a short connector by moving it above or below the nodes' reach", () => {
    // 98px connector, 127px label (the architecture fixture's case) between two nodes 78px tall
    const path = H(545, 1407, 1505);
    const left: Box = { minX: 1190, minY: 506, maxX: 1407, maxY: 584 };
    const right: Box = { minX: 1505, minY: 506, maxX: 1700, maxY: 584 };
    const [placed] = placeEdgeLabels([{ id: "e", text: "publish OrderPlaced", points: path }], [left, right], new Map([["e", path]]));
    expect(overlaps(placed.box, left)).toBe(false);
    expect(overlaps(placed.box, right)).toBe(false);
  });
});

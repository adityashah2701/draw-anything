import { describe, expect, it } from "vitest";
import { findGridRoute } from "./grid-route";

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });
const inside = (p: { x: number; y: number }, b: ReturnType<typeof box>) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;

/** Does any segment of the path pass through the interior of the box? (orthogonal paths only) */
const hits = (path: Array<{ x: number; y: number }>, b: ReturnType<typeof box>) =>
  path.slice(0, -1).some((p, i) => {
    const q = path[i + 1];
    return Math.min(p.x, q.x) < b.maxX && Math.max(p.x, q.x) > b.minX && Math.min(p.y, q.y) < b.maxY && Math.max(p.y, q.y) > b.minY;
  });

describe("findGridRoute", () => {
  it("goes straight when nothing is in the way", () => {
    expect(findGridRoute({ from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, boxes: [] })).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }]);
  });

  it("goes around one wall with the fewest bends", () => {
    const wall = box(-50, 40, 50, 60);
    const path = findGridRoute({ from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, boxes: [wall] })!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 0, y: 100 });
    expect(hits(path, wall)).toBe(false);
    expect(path.length - 2).toBe(2); // sideways, along the wall, back: two bends is the minimum
  });

  it("threads a path through several rows of obstacles that no single-lane shape can avoid", () => {
    // Two staggered rows: a Z or U path through one lane always cuts one of them.
    const boxes = [box(-120, 40, 20, 80), box(40, 40, 160, 80), box(-160, 140, -20, 180), box(0, 140, 120, 180)];
    const path = findGridRoute({ from: { x: 10, y: 0 }, to: { x: 10, y: 260 }, boxes })!;
    expect(path).not.toBeNull();
    boxes.forEach((b) => expect(hits(path, b)).toBe(false));
  });

  it("is deterministic", () => {
    const boxes = [box(-50, 40, 50, 60), box(60, -10, 90, 120)];
    const a = findGridRoute({ from: { x: 0, y: 0 }, to: { x: 120, y: 100 }, boxes });
    const b = findGridRoute({ from: { x: 0, y: 0 }, to: { x: 120, y: 100 }, boxes });
    expect(a).toEqual(b);
  });

  it("returns null when the target is walled in", () => {
    const ring = [box(-100, -100, 100, -80), box(-100, 80, 100, 100), box(-100, -100, -80, 100), box(80, -100, 100, 100)];
    expect(findGridRoute({ from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, boxes: ring })).toBeNull();
  });

  it("never ends inside a box it was told to avoid", () => {
    const wall = box(-50, 40, 50, 60);
    const path = findGridRoute({ from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, boxes: [wall] })!;
    path.forEach((p) => expect(inside(p, wall)).toBe(false));
  });
});

import { describe, expect, it } from "vitest";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { computeDrag, startDragSession, unionBounds } from "./drag-session";

const b = (x: number, y: number, w: number, h: number): Bounds => ({ minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h });
const base = { start: { x: 0, y: 0 }, threshold: 6, snap: true };

describe("computeDrag", () => {
  it("is origin + total travel, with no snapping when nothing is near", () => {
    const r = computeDrag({ ...base, point: { x: 40, y: 25 }, selection: b(0, 0, 100, 50), targets: [b(1000, 1000, 10, 10)] });
    expect(r).toEqual({ dx: 40, dy: 25, guides: [] });
  });

  it("the same pointer position always gives the same result, however it was reached", () => {
    const input = { ...base, selection: b(0, 0, 100, 50), targets: [b(300, 0, 100, 50)] };
    const direct = computeDrag({ ...input, point: { x: 203, y: 2 } });
    // an accumulation-free function: a wiggle path before the final point changes nothing
    computeDrag({ ...input, point: { x: 500, y: -90 } });
    expect(computeDrag({ ...input, point: { x: 203, y: 2 } })).toEqual(direct);
  });

  it("snaps the selection's edge to a neighbour's edge within the threshold and reports the guide", () => {
    // selection right edge at 100+197=297 -> neighbour left edge 300 is 3 away
    const r = computeDrag({ ...base, point: { x: 197, y: 0 }, selection: b(0, 0, 100, 50), targets: [b(300, 200, 80, 40)] });
    expect(r.dx).toBe(200);
    expect(r.guides).toContainEqual({ axis: "x", at: 300, from: 0, to: 240 });
  });

  it("snaps centres, and vertical and horizontal independently", () => {
    const r = computeDrag({ ...base, point: { x: 3, y: 98 }, selection: b(0, 0, 100, 50), targets: [b(0, 100, 100, 50)] });
    expect(r.dx).toBe(0); // left edges line up (and centres)
    expect(r.dy).toBe(100); // top edge on the neighbour's top
    expect(r.guides.some((g) => g.axis === "x")).toBe(true);
    expect(r.guides.some((g) => g.axis === "y")).toBe(true);
  });

  it("does not snap beyond the threshold, or when snapping is off (Alt)", () => {
    const input = { ...base, point: { x: 190, y: 0 }, selection: b(0, 0, 100, 50), targets: [b(300, 200, 80, 40)] };
    expect(computeDrag(input).dx).toBe(190); // 10 away
    expect(computeDrag({ ...input, point: { x: 197, y: 0 }, snap: false })).toEqual({ dx: 197, dy: 0, guides: [] });
  });

  it("scales with zoom: the caller passes a world threshold", () => {
    const input = { ...base, point: { x: 190, y: 0 }, selection: b(0, 0, 100, 50), targets: [b(300, 200, 80, 40)] };
    expect(computeDrag({ ...input, threshold: 12 }).dx).toBe(200);
  });

  it("handles 2,000 targets in well under a frame", () => {
    const targets = Array.from({ length: 2000 }, (_, i) => b((i % 50) * 130, Math.floor(i / 50) * 90, 100, 50));
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) computeDrag({ ...base, point: { x: 413 + i, y: 207 }, selection: b(0, 0, 100, 50), targets });
    expect((performance.now() - t0) / 100).toBeLessThan(4);
  });
});

describe("unionBounds", () => {
  it("covers all boxes, and is null for none", () => {
    expect(unionBounds([b(0, 0, 10, 10), b(20, 30, 10, 10)])).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 40, width: 30, height: 40 });
    expect(unionBounds([])).toBeNull();
  });
});

describe("startDragSession", () => {
  const box = (id: string, x: number, extra: Record<string, unknown> = {}) =>
    ({ id, type: "rectangle", points: [{ x, y: 0 }, { x: x + 10, y: 10 }], ...extra }) as never;
  const bounds = (el: { points: { x: number; y: number }[] }) => ({
    minX: el.points[0].x,
    minY: 0,
    maxX: el.points[1].x,
    maxY: 10,
    width: 10,
    height: 10,
  });

  it("captures the moving elements and aligns only against other plain shapes", () => {
    const elements = [
      box("a", 0),
      box("b", 100),
      box("frame", 200, { isGuide: true }),
      { id: "line", type: "freehand", points: [{ x: 300, y: 0 }, { x: 310, y: 10 }] } as never,
    ];
    const session = startDragSession(["a"], elements, { x: 5, y: 5 }, bounds);
    expect(session?.origin.map((el) => el.id)).toEqual(["a"]);
    expect(session?.targets).toEqual([bounds(elements[1])]);
    expect(session?.start).toEqual({ x: 5, y: 5 });
  });

  it("is null when nothing moving has bounds", () => {
    expect(startDragSession(["missing"], [box("a", 0)], { x: 0, y: 0 }, bounds)).toBeNull();
  });
});

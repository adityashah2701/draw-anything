import { describe, expect, it } from "vitest";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { buildGroupIndex } from "@/core/groups/group-index";
import { boundsOf, group, rect } from "@/core/groups/test-helpers";
import { computeDrag, computeSmartDrag, startDragSession, unionBounds } from "./drag-session";

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


describe("startDragSession with groups and text", () => {
  const stored = [
    rect("a", 0, 0, 100, 50),
    rect("b", 120, 0, 100, 50, { groupId: "G" }),
    rect("c", 240, 0, 100, 50, { groupId: "G" }),
    rect("far", 600, 0, 100, 50),
    { id: "t", type: "text", text: "hi", fontSize: 20, color: "#000", strokeWidth: 1, points: [{ x: 0, y: 200 }] },
    group("G"),
  ] as never[];
  const index = buildGroupIndex(stored);
  const shapes = [...index.shapes.values()];
  const getBounds = (el: (typeof shapes)[number]) => (el.type === "text" ? { minX: 0, minY: 200, maxX: 40, maxY: 224, width: 40, height: 24 } : boundsOf(el));
  const start = (moving: string[], extra = {}) => startDragSession(moving, shapes, { x: 0, y: 0 }, getBounds, { index, ...extra })!;

  it("measures a group as one neighbour, not as its shapes", () => {
    const session = start(["a"]);
    expect(session.spaceTargets).toContainEqual({ minX: 120, minY: 0, maxX: 340, maxY: 50, width: 220, height: 50 });
    expect(session.spaceTargets).toHaveLength(3); // G, far, t
    expect(session.targets).toHaveLength(4); // but edges and centres of every shape can still be aligned with
  });

  it("without a group index every shape is its own neighbour", () => {
    expect(startDragSession(["a"], shapes, { x: 0, y: 0 }, getBounds)!.spaceTargets).toHaveLength(4);
  });

  it("collects text baselines of what is moving and of what it may align with", () => {
    const baselineOf = (el: (typeof shapes)[number]) => (el.type === "text" ? el.points[0].y + 18 : null);
    const moving = start(["t"], { baselineOf });
    expect(moving.baselines).toEqual([218]);
    const other = start(["a"], { baselineOf });
    expect(other.alignTargets.find((t) => t.baselines)?.baselines).toEqual([218]);
  });

  it("measures siblings inside the group being edited and still reaches outside it", () => {
    const session = start(["b"], { context: "G" });
    expect(session.spaceTargets).toContainEqual(expect.objectContaining({ minX: 240, maxX: 340 })); // sibling c on its own
    expect(session.spaceTargets).toContainEqual(expect.objectContaining({ minX: 0, maxX: 100 })); // a, outside
  });
});

describe("computeSmartDrag", () => {
  const stored = [rect("a", 0, 0, 100, 50), rect("c", 400, 0, 100, 50), rect("m", 195, 300, 100, 50)] as never[];
  const shapes = [...buildGroupIndex(stored).shapes.values()];
  const session = startDragSession(["m"], shapes, { x: 0, y: 0 }, (el) => boundsOf(el))!;
  const input = { session, threshold: 6, options: { spacing: true, measures: true } };

  it("is the raw pointer travel when snapping is off", () => {
    expect(computeSmartDrag({ ...input, point: { x: 5, y: -300 }, snap: false })).toEqual({ dx: 5, dy: -300, guides: [], spans: [] });
  });

  it("snaps to equal spacing and reports the gaps, in the same call as the alignment guides", () => {
    const r = computeSmartDrag({ ...input, point: { x: 0, y: -300 }, snap: true }); // m at (195, 0): between a and c
    expect(r.dx).toBe(5);
    expect(r.dy).toBe(-300); // top edges already line up
    expect(r.spans.filter((s) => s.kind === "gap")).toHaveLength(2);
    expect(r.guides.some((g) => g.axis === "y")).toBe(true);
  });

  it("uses the pointer travel, not any earlier position", () => {
    const first = computeSmartDrag({ ...input, point: { x: 1, y: -300 }, snap: true });
    computeSmartDrag({ ...input, point: { x: 900, y: 900 }, snap: true });
    expect(computeSmartDrag({ ...input, point: { x: 1, y: -300 }, snap: true })).toEqual(first);
  });

  it("leaves spacing out when it is switched off", () => {
    const r = computeSmartDrag({ ...input, options: { spacing: false, measures: false }, point: { x: 0, y: -300 }, snap: true });
    expect(r.dx).toBe(0);
    expect(r.spans).toEqual([]);
  });
});

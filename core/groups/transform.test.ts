import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { makeBounds } from "@/core/geometry/box";
import { clampFrame, minimumScale, partitionConnectors, rotateShape, scaleShape, scaleShapes } from "./transform";
import { arrow, boundsOf, rect } from "./test-helpers";

const box = (minX: number, minY: number, maxX: number, maxY: number) => makeBounds(minX, minY, maxX, maxY);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("scaleShape", () => {
  it("maps a box shape so position and size scale together", () => {
    const r = rect("a", 100, 50, 200, 100);
    const out = scaleShape(r, box(0, 0, 400, 200), box(0, 0, 200, 400));
    expect(out.points).toEqual([
      { x: 50, y: 100 },
      { x: 150, y: 300 },
    ]);
  });

  it("keeps child-relative positions exactly when a group is scaled", () => {
    const from = box(0, 0, 300, 100);
    const members = [rect("a", 0, 0, 100, 100), rect("b", 100, 0, 100, 100), rect("c", 200, 0, 100, 100)];
    const to = box(50, 20, 650, 220); // 2x wide, 2x tall, moved
    const out = scaleShapes(members, from, to);
    const rel = (shapes: DrawingElement[], frame: ReturnType<typeof box>) =>
      shapes.map((s) => {
        const b = boundsOf(s)!;
        return [(b.minX - frame.minX) / frame.width, (b.maxX - frame.minX) / frame.width, (b.minY - frame.minY) / frame.height, (b.maxY - frame.minY) / frame.height];
      });
    const before = rel(members, from);
    const after = rel(out, to);
    before.forEach((row, i) => row.forEach((v, j) => close(after[i][j], v)));
  });

  it("is the identity for the same box and a pure move for an equal-size box", () => {
    const r = rect("a", 10, 10, 50, 50);
    expect(scaleShape(r, box(0, 0, 100, 100), box(0, 0, 100, 100)).points).toEqual(r.points);
    expect(scaleShape(r, box(0, 0, 100, 100), box(100, 200, 200, 300)).points[0]).toEqual({ x: 110, y: 210 });
  });

  it("only moves along an axis that has no extent to scale", () => {
    const vertical = { ...rect("l", 10, 0, 0, 100), type: "line" } as DrawingElement;
    const out = scaleShape(vertical, box(10, 0, 10, 100), box(30, 0, 50, 200));
    expect(out.points[0].x).toBe(30);
    expect(out.points[1].y).toBe(200);
  });

  it("scales every point of a multi-point connector, keeping it orthogonal", () => {
    const route: DrawingElement = {
      ...arrow("ar", "a", "b"),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 80 },
        { x: 100, y: 80 },
      ],
    };
    const out = scaleShape(route, box(0, 0, 100, 80), box(0, 0, 300, 160));
    expect(out.points).toEqual([
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 160 },
      { x: 300, y: 160 },
    ]);
    expect((out as { startConnection?: unknown }).startConnection).toEqual({ elementId: "a" });
  });

  it("keeps a circle a circle: centre mapped, radius follows the smaller factor", () => {
    const circle = { id: "c", type: "circle", color: "#000", strokeWidth: 2, points: [{ x: 50, y: 50 }, { x: 80, y: 50 }] } as DrawingElement;
    const out = scaleShape(circle, box(0, 0, 100, 100), box(0, 0, 400, 200));
    expect(out.points[0]).toEqual({ x: 200, y: 100 });
    close(Math.hypot(out.points[1].x - out.points[0].x, out.points[1].y - out.points[0].y), 60); // 30 * min(4, 2)
  });

  it("scales text size only for a uniform scale", () => {
    const text = { id: "t", type: "text", text: "hi", fontSize: 20, color: "#000", strokeWidth: 1, points: [{ x: 10, y: 10 }] } as DrawingElement;
    expect(scaleShape(text, box(0, 0, 100, 100), box(0, 0, 200, 200)).fontSize).toBe(40);
    expect(scaleShape(text, box(0, 0, 100, 100), box(0, 0, 200, 100)).fontSize).toBe(20);
    expect(scaleShape(text, box(0, 0, 100, 100), box(0, 0, 200, 100)).points[0]).toEqual({ x: 20, y: 10 });
  });

  it("does not mutate its input", () => {
    const r = rect("a", 10, 10, 50, 50);
    const before = JSON.stringify(r);
    scaleShape(r, box(0, 0, 100, 100), box(0, 0, 10, 10));
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("minimum frame size", () => {
  it("never lets a child shrink below the floor", () => {
    const m = minimumScale([box(0, 0, 100, 100), box(0, 0, 8, 40)]);
    close(m.x, 0.5); // 4 / 8
    close(m.y, 0.1); // 4 / 40
  });

  it("is not held back by children that are already tiny, and never asks to grow", () => {
    expect(minimumScale([box(0, 0, 3, 3)])).toEqual({ x: 0, y: 0 });
    expect(minimumScale([box(0, 0, 4.5, 4.5)]).x).toBeLessThanOrEqual(1);
    expect(minimumScale([])).toEqual({ x: 0, y: 0 });
  });

  it("grows a too-small frame on the side opposite the fixed edge", () => {
    const from = box(0, 0, 100, 100);
    const tiny = box(80, 80, 82, 82);
    const fromLeftTop = clampFrame(from, tiny, { x: 0.5, y: 0.5 }, { left: true, top: true });
    expect([fromLeftTop.minX, fromLeftTop.maxX]).toEqual([80, 130]);
    const fromRightBottom = clampFrame(from, tiny, { x: 0.5, y: 0.5 }, { left: false, top: false });
    expect([fromRightBottom.minX, fromRightBottom.maxX]).toEqual([32, 82]);
  });
});

describe("rotateShape", () => {
  const local = box(0, 0, 100, 50);

  it("rotates polylines point by point", () => {
    const line = { id: "l", type: "line", color: "#000", strokeWidth: 2, points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] } as DrawingElement;
    const out = rotateShape(line, { x: 0, y: 0 }, 90, null, false);
    close(out.points[0].x, 0);
    close(out.points[0].y, 10);
    close(out.points[1].y, 20);
    expect(out.rotation).toBeUndefined();
  });

  it("turns a rotatable box about the pivot: centre moves, rotation accumulates", () => {
    const r = rect("a", 0, 0, 100, 50);
    const out = rotateShape(r, { x: 150, y: 25 }, 180, local, true);
    // centre (50,25) -> (250,25); the shape itself is rotated 180 about its centre
    expect(out.points[0]).toEqual({ x: 200, y: 0 });
    expect(out.rotation).toBe(180);
    const again = rotateShape(out, { x: 0, y: 0 }, 200, boundsOf(out), true);
    expect(again.rotation).toBe(20); // (180 + 200) mod 360
  });

  it("rotating about its own centre leaves the points alone and sets only the angle", () => {
    const r = rect("a", 0, 0, 100, 50);
    const out = rotateShape(r, { x: 50, y: 25 }, 30, local, true);
    out.points.forEach((p, i) => {
      close(p.x, r.points[i].x);
      close(p.y, r.points[i].y);
    });
    expect(out.rotation).toBe(30);
  });

  it("moves but does not turn a shape that cannot rotate", () => {
    const r = rect("a", 0, 0, 100, 50);
    const out = rotateShape(r, { x: 150, y: 25 }, 180, local, false);
    expect(out.rotation).toBeUndefined();
    expect(out.points[0]).toEqual({ x: 200, y: 0 });
  });

  it("is a no-op for zero degrees and for unmeasurable shapes", () => {
    const r = rect("a", 0, 0, 100, 50);
    expect(rotateShape(r, { x: 0, y: 0 }, 0, local, true)).toBe(r);
    expect(rotateShape(r, { x: 0, y: 0 }, 45, null, true)).toBe(r);
  });
});

describe("partitionConnectors", () => {
  it("lets connectors between moving shapes travel rigidly", () => {
    const moving = [rect("a", 0, 0), rect("b", 200, 0), arrow("ab", "a", "b")];
    const { rigid, reroute } = partitionConnectors(moving);
    expect(rigid.map((s) => s.id)).toEqual(["a", "b", "ab"]);
    expect(reroute).toEqual([]);
  });

  it("re-routes a connector whose other end stays behind", () => {
    const moving = [rect("a", 0, 0), arrow("ax", "a", "outside")];
    const { rigid, reroute } = partitionConnectors(moving);
    expect(rigid.map((s) => s.id)).toEqual(["a"]);
    expect(reroute.map((s) => s.id)).toEqual(["ax"]);
  });

  it("treats a free connector as rigid and a one-sided connector by its attached end", () => {
    const moving = [rect("a", 0, 0), arrow("free", undefined, undefined), arrow("half", "a", undefined)];
    expect(partitionConnectors(moving).rigid.map((s) => s.id)).toEqual(["a", "free", "half"]);
  });
});

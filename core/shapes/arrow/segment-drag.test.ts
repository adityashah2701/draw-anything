import { describe, expect, it } from "vitest";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";

const P = (...n: number[]): Point[] => Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i], y: n[2 * i + 1] }));
const arrow = (points: Point[], extra: Record<string, unknown> = {}): DrawingElement =>
  ({
    id: "a", type: "arrow", color: "#000", strokeWidth: 2, points, routingMode: "orthogonal",
    startConnection: { elementId: "s", anchorId: "s-anchor-right" },
    endConnection: { elementId: "t", anchorId: "t-anchor-left" },
    ...extra,
  }) as DrawingElement;
const drag = (el: DrawingElement, handle: string, to: Point) => getShapeDefinition("arrow")!.onResize!(el as never, handle, to) as unknown as DrawingElement;
const orthogonal = (pts: Point[]) => pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
const text = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

// A Z path (4 points), an S path (6 points) and a path with a detour (5 points); right anchor to left anchor.
const PATHS: Record<string, Point[]> = {
  z: P(220, 130, 360, 130, 360, 330, 500, 330),
  s: P(220, 130, 300, 130, 300, 230, 420, 230, 420, 330, 500, 330),
  detour: P(220, 130, 300, 130, 300, 60, 440, 60, 440, 330, 500, 330),
};

describe("dragging a segment of an orthogonal arrow", () => {
  for (const [name, points] of Object.entries(PATHS)) {
    const el = arrow(points);
    for (let i = 0; i < points.length - 1; i += 1) {
      it(`${name} path, segment ${i}: every frame is orthogonal, anchored and does not grow`, () => {
        for (const to of [{ x: 150, y: 20 }, { x: 330, y: 200 }, { x: 410, y: 260 }, { x: 700, y: 400 }, { x: 360, y: 130 }]) {
          const out = drag(el, `segment-${i}`, to).points;
          expect(orthogonal(out), `${text(out)} for ${JSON.stringify(to)}`).toBe(true);
          expect(out[0]).toEqual(points[0]);
          expect(out[out.length - 1]).toEqual(points[points.length - 1]);
          expect(out.length, text(out)).toBeLessThanOrEqual(points.length + 2);
          // it still leaves and arrives horizontally, outward: the anchors are a right and a left side
          expect(out[1].y, text(out)).toBe(out[0].y);
          expect(out[1].x, text(out)).toBeGreaterThan(out[0].x);
          expect(out[out.length - 2].y, text(out)).toBe(out[out.length - 1].y);
          expect(out[out.length - 2].x, text(out)).toBeLessThan(out[out.length - 1].x);
        }
      });
    }
  }

  it("dragging the first segment slides the lane it leads to, instead of adding bends at the anchor", () => {
    const out = drag(arrow(PATHS.z), "segment-0", { x: 300, y: 500 }).points;
    expect(text(out)).toBe("220,130 300,130 300,330 500,330");
  });

  it("never lets the lane cross the anchor: it stays a stub's length out", () => {
    expect(drag(arrow(PATHS.z), "segment-0", { x: 100, y: 130 }).points[1].x).toBeGreaterThanOrEqual(232);
    expect(drag(arrow(PATHS.z), "segment-2", { x: 900, y: 330 }).points.at(-2)!.x).toBeLessThanOrEqual(488);
  });

  it("the result depends only on where the pointer is, not on the frames before it", () => {
    const el = arrow(PATHS.s);
    const direct = drag(el, "segment-2", { x: 380, y: 150 }).points;
    // chaining frames from the snapshot (what the editor does) ends in the same place
    let last: Point[] = [];
    for (const to of [{ x: 300, y: 200 }, { x: 340, y: 90 }, { x: 380, y: 150 }]) last = drag(el, "segment-2", to).points;
    expect(text(last)).toBe(text(direct));
  });

  it("marks the arrow as manually routed", () => {
    expect(drag(arrow(PATHS.z), "segment-1", { x: 400, y: 200 })).toMatchObject({ isManuallyRouted: true });
  });
});

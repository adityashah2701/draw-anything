import { describe, expect, it } from "vitest";
import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import { createRouteEngineState, routeArrowPoints, routeWithEngine } from "./orthogonal-router";

type Side = "left" | "right" | "top" | "bottom";
interface Box { id: string; x: number; y: number; w: number; h: number }

const anchor = (b: Box, side: Side): Point =>
  side === "left" ? { x: b.x, y: b.y + b.h / 2 } : side === "right" ? { x: b.x + b.w, y: b.y + b.h / 2 } : side === "top" ? { x: b.x + b.w / 2, y: b.y } : { x: b.x + b.w / 2, y: b.y + b.h };
const obstacle = (b: Box) => ({ id: b.id, bounds: { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h } });

const route = (edges: Array<{ id: string; from: Box; fromSide: Side; to: Box; toSide: Side }>, boxes: Box[]) => {
  const res = routeWithEngine(
    edges.map((e) => ({
      arrowId: e.id, start: anchor(e.from, e.fromSide), end: anchor(e.to, e.toSide), startHandle: e.fromSide, endHandle: e.toSide,
      sourceId: e.from.id, targetId: e.to.id, routingMode: "orthogonal",
    })) as never,
    { obstacles: boxes.map(obstacle), existingRoutes: [], allParallelCandidates: [] } as never,
    createRouteEngineState(),
  );
  return res.routes;
};

/** The way a path must meet an anchor: along the side's normal (horizontal for left/right), and outward from the shape. */
const approachProblems = (points: Point[], at: Point, side: Side, which: "start" | "end"): string[] => {
  const problems: string[] = [];
  const [a, b] = which === "start" ? [points[0], points[1]] : [points[points.length - 1], points[points.length - 2]];
  if (a.x !== at.x || a.y !== at.y) problems.push(`${which} is not on its anchor`);
  const horizontal = side === "left" || side === "right";
  if (horizontal ? a.y !== b.y : a.x !== b.x) problems.push(`${which} runs along the shape's edge instead of away from it`);
  const out = side === "left" ? -1 : side === "top" ? -1 : 1;
  const delta = horizontal ? b.x - a.x : b.y - a.y;
  if (delta !== 0 && Math.sign(delta) !== out) problems.push(`${which} leaves into the shape`);
  return problems;
};

const orthogonal = (points: Point[]) => points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y);

describe("orthogonal routes meet their anchors cleanly", () => {
  const boxes = (ax: number, ay: number, bx: number, by: number): [Box, Box] => [
    { id: "a", x: ax, y: ay, w: 120, h: 60 },
    { id: "b", x: bx, y: by, w: 120, h: 60 },
  ];
  const SIDES: Side[] = ["left", "right", "top", "bottom"];
  const OFFSETS: Array<[number, number]> = [[400, 200], [400, -200], [300, 0], [0, 260], [-380, 190], [40, 180], [-60, -220]];

  for (const [dx, dy] of OFFSETS) {
    for (const fromSide of SIDES) {
      for (const toSide of SIDES) {
        it(`a ${fromSide} anchor to a ${toSide} anchor, target at (${dx}, ${dy})`, () => {
          const [a, b] = boxes(100, 400, 100 + dx, 400 + dy);
          const points = route([{ id: "x", from: a, fromSide, to: b, toSide }], [a, b]).get("x")!;
          const text = points.map((p) => `${p.x},${p.y}`).join(" ");
          expect(orthogonal(points), text).toBe(true);
          const problems = [...approachProblems(points, anchor(a, fromSide), fromSide, "start"), ...approachProblems(points, anchor(b, toSide), toSide, "end")];
          expect(problems, `${text}\n${problems.join("; ")}`).toEqual([]);
        });
      }
    }
  }
});

describe("manual routes after a shape moves", () => {
  const P = (...n: number[]): Point[] => Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i], y: n[2 * i + 1] }));
  const manual = (existing: Point[], end: Point) => routeArrowPoints({ start: { x: 220, y: 130 }, end, startHandle: "right", endHandle: "left", existingPoints: existing, preserveManualBends: true });
  const text = (p: Point[]) => p.map((q) => `${q.x},${q.y}`).join(" ");

  it("keeps the user's bends while they still fit", () => {
    const out = manual(P(220, 130, 400, 130, 400, 330, 500, 330), { x: 560, y: 370 });
    expect(text(out)).toBe("220,130 400,130 400,370 560,370"); // the lane at x=400 is where the user put it
  });

  it("drops bends that would make the path run through the target's own side, and routes afresh", () => {
    const out = manual(P(220, 130, 400, 130, 400, 330, 500, 330), { x: 300, y: 40 }); // target moved up and left of the lane
    expect(approachProblems(out, { x: 300, y: 40 }, "left", "end"), text(out)).toEqual([]);
    expect(orthogonal(out)).toBe(true);
  });

  it("repairs a path that arrived along the target's edge", () => {
    const out = manual(P(220, 130, 528, 130, 528, 336, 500, 336, 500, 330), { x: 560, y: 370 });
    expect(approachProblems(out, { x: 560, y: 370 }, "left", "end"), text(out)).toEqual([]);
  });
});

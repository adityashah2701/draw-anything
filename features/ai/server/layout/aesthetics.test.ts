import { describe, expect, it } from "vitest";
import type { ArrowShape, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import { measureAesthetics, segmentBoxDistance } from "./aesthetics";

const node = (id: string, x: number, y: number, w = 100, h = 60): DrawingElement =>
  ({
    id,
    type: "semantic-node",
    points: [
      { x, y },
      { x: x + w, y: y + h },
    ],
    label: id,
    ai: { role: "node", semanticId: id },
  }) as DrawingElement;

const arrow = (id: string, from: string, to: string, points: Point[]): ArrowShape =>
  ({
    id,
    type: "arrow",
    points,
    startConnection: { elementId: from },
    endConnection: { elementId: to },
  }) as ArrowShape;

describe("segmentBoxDistance", () => {
  const box = { minX: 100, minY: 100, maxX: 200, maxY: 200 };

  it("is 0 when the segment passes through the box and when it lies inside", () => {
    expect(segmentBoxDistance({ x: 0, y: 150 }, { x: 300, y: 150 }, box)).toBe(0);
    expect(segmentBoxDistance({ x: 120, y: 120 }, { x: 180, y: 180 }, box)).toBe(0);
  });

  it("measures the gap to a side and to a corner", () => {
    expect(segmentBoxDistance({ x: 98, y: 0 }, { x: 98, y: 300 }, box)).toBe(2);
    expect(segmentBoxDistance({ x: 240, y: 240 }, { x: 300, y: 240 }, box)).toBeCloseTo(Math.hypot(40, 40), 5);
  });
});

describe("measureAesthetics", () => {
  it("reports the shortest arrow-to-shape clearance among shapes that are not the arrow's own ends", () => {
    const nodes = [node("a", 0, 0), node("b", 0, 300), node("c", 140, 100, 100, 100)];
    // a straight line a -> b that passes 40 units left of c (c starts at x = 140; the line is at x = 100).
    const near = arrow("e1", "a", "b", [
      { x: 50, y: 60 },
      { x: 100, y: 60 },
      { x: 100, y: 300 },
    ]);
    expect(measureAesthetics([...nodes, near]).minClearance).toBe(40);

    const nearer = arrow("e1", "a", "b", [
      { x: 50, y: 60 },
      { x: 138, y: 60 },
      { x: 138, y: 300 },
    ]);
    expect(measureAesthetics([...nodes, nearer]).minClearance).toBe(2);
  });

  it("has no clearance figure when no arrow passes a foreign shape", () => {
    const els = [node("a", 0, 0), node("b", 0, 200), arrow("e", "a", "b", [{ x: 50, y: 60 }, { x: 50, y: 200 }])];
    expect(measureAesthetics(els).minClearance).toBeNull();
  });

  it("counts bends per arrow", () => {
    const els = [
      node("a", 0, 0),
      node("b", 300, 300),
      arrow("e", "a", "b", [
        { x: 100, y: 30 },
        { x: 200, y: 30 },
        { x: 200, y: 330 },
        { x: 300, y: 330 },
      ]),
    ];
    const m = measureAesthetics(els);
    expect(m.maxBends).toBe(2);
    expect(m.meanBends).toBe(2);
  });

  it("shares of aligned shapes: a column of three is fully aligned, a scatter is not", () => {
    const column = [node("a", 0, 0), node("b", 0, 150), node("c", 0, 300)];
    expect(measureAesthetics(column).alignment).toBe(1);
    const scatter = [node("a", 0, 0), node("b", 170, 130), node("c", 333, 291)];
    expect(measureAesthetics(scatter).alignment).toBe(0);
  });

  it("flags messages that run against the dominant flow", () => {
    const ordered = [
      node("a", 0, 0),
      node("b", 0, 150),
      node("c", 0, 300),
      arrow("e1", "a", "b", [{ x: 50, y: 60 }, { x: 50, y: 150 }]),
      arrow("e2", "b", "c", [{ x: 50, y: 210 }, { x: 50, y: 300 }]),
    ];
    expect(measureAesthetics(ordered).readingConsistency).toBe(1);

    const against = [...ordered, arrow("e3", "c", "a", [{ x: 80, y: 300 }, { x: 80, y: 60 }])];
    expect(measureAesthetics(against).readingConsistency).toBe(0.667); // 2 of 3, rounded to 3 places
  });

  it("measures how far the drawing's weight sits from the middle of its extent", () => {
    const balanced = [node("a", 0, 0), node("b", 300, 0), node("c", 0, 300), node("d", 300, 300)];
    expect(measureAesthetics(balanced).centroidOffset).toBeCloseTo(0, 5);
    const lopsided = [node("a", 0, 0), node("b", 20, 0), node("c", 0, 20), node("d", 600, 600)];
    expect(measureAesthetics(lopsided).centroidOffset).toBeGreaterThan(0.2);
  });

  it("measures how loosely a group frame wraps its members (1 is tight)", () => {
    const frame = {
      id: "f",
      type: "rectangle",
      points: [{ x: -5, y: -5 }, { x: 205, y: 105 }],
      ai: { role: "group", semanticId: "g" },
    } as unknown as DrawingElement;
    const members = [node("a", 0, 0, 100, 100), node("b", 120, 0, 80, 100)];
    const tight = measureAesthetics([frame, ...members], [{ id: "g", nodeIds: ["a", "b"] }]).groupLooseness;
    expect(tight).toBeGreaterThan(1);
    expect(tight).toBeLessThan(1.3);
    expect(measureAesthetics(members).groupLooseness).toBeNull();
  });

  it("answers for an empty drawing and for a single shape without dividing by zero", () => {
    for (const els of [[] as DrawingElement[], [node("a", 0, 0)]]) {
      const m = measureAesthetics(els);
      expect(Object.values(m).every((v) => v === null || Number.isFinite(v))).toBe(true);
      expect(m.alignment).toBe(1);
      expect(m.readingConsistency).toBe(1);
    }
  });

  it("returns identical numbers for identical input", () => {
    const els = [node("a", 0, 0), node("b", 200, 80), arrow("e", "a", "b", [{ x: 100, y: 30 }, { x: 200, y: 110 }])];
    expect(measureAesthetics(els)).toEqual(measureAesthetics(els));
  });
});

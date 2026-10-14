import { describe, expect, it } from "vitest";
import { containsPointInRectangle } from "./interaction";
import type { RectangleShape } from "./types";

const rect = (extra: Partial<RectangleShape> = {}): RectangleShape => ({
  id: "r",
  type: "rectangle",
  color: "#000",
  strokeWidth: 2,
  points: [{ x: 0, y: 0 }, { x: 400, y: 300 }],
  ...extra,
});

describe("containsPointInRectangle", () => {
  it("hits the whole area of an ordinary rectangle", () => {
    expect(containsPointInRectangle(rect(), { x: 200, y: 150 })).toBe(true);
    expect(containsPointInRectangle(rect(), { x: 500, y: 150 })).toBe(false);
  });

  it("applies the tolerance radius outside the edge", () => {
    expect(containsPointInRectangle(rect(), { x: 404, y: 150 }, 5)).toBe(true);
    expect(containsPointInRectangle(rect(), { x: 410, y: 150 }, 5)).toBe(false);
  });

  describe("an unfilled guide frame (an AI group box)", () => {
    const frame = rect({ isGuide: true });

    it("is not hit from its empty interior, so the nodes inside stay reachable", () => {
      expect(containsPointInRectangle(frame, { x: 200, y: 150 })).toBe(false);
      expect(containsPointInRectangle(frame, { x: 200, y: 150 }, 6)).toBe(false);
    });

    it("is hit on its border, with the usual tolerance", () => {
      expect(containsPointInRectangle(frame, { x: 0, y: 150 })).toBe(true);
      expect(containsPointInRectangle(frame, { x: 400, y: 150 })).toBe(true);
      expect(containsPointInRectangle(frame, { x: 200, y: 0 })).toBe(true);
      expect(containsPointInRectangle(frame, { x: 200, y: 300 })).toBe(true);
      expect(containsPointInRectangle(frame, { x: 3, y: 150 }, 6)).toBe(true);
      expect(containsPointInRectangle(frame, { x: 404, y: 150 }, 6)).toBe(true);
    });

    it("is not hit from outside", () => {
      expect(containsPointInRectangle(frame, { x: -20, y: 150 }, 6)).toBe(false);
    });

    it("stays fully hittable when it is too small to have an interior", () => {
      const tiny = rect({ isGuide: true, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] });
      expect(containsPointInRectangle(tiny, { x: 5, y: 5 }, 6)).toBe(true);
    });

    it("is hit everywhere once the user gives it a fill", () => {
      expect(containsPointInRectangle(rect({ isGuide: true, fill: "#fef3c7" }), { x: 200, y: 150 })).toBe(true);
    });

    it.each(["transparent", "none", ""])("treats fill %j as unfilled", (fill) => {
      expect(containsPointInRectangle(rect({ isGuide: true, fill }), { x: 200, y: 150 })).toBe(false);
    });
  });

  it("ignores degenerate shapes", () => {
    expect(containsPointInRectangle(rect({ points: [{ x: 0, y: 0 }] }), { x: 0, y: 0 })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { aiAnchorShift, cornerOf, planDiagramCode, shiftElement } from "./diagram-placement";

const el = (id: string, ...pts: [number, number][]) =>
  ({ id, type: "rectangle", points: pts.map(([x, y]) => ({ x, y })) }) as DrawingElement;
const view = { zoom: 2, panOffset: { x: -200, y: -100 } };

describe("diagram placement", () => {
  it("finds the top-left corner across all points", () => {
    expect(cornerOf([el("a", [50, 90], [60, 100]), el("b", [20, 120], [30, 130])])).toEqual({ x: 20, y: 90 });
  });

  it("anchors an AI diagram's corner 80 units inside the viewport, using the whole batch", () => {
    // viewport top-left in world units is (100, 50), so the corner should land at (180, 130)
    const shift = aiAnchorShift([el("a", [500, 400]), el("b", [300, 380])], view);
    expect(shift).toEqual({ x: 180 - 300, y: 130 - 380 });
  });

  it("has nothing to anchor on without points", () => {
    expect(aiAnchorShift([el("a")], view)).toBeNull();
    expect(aiAnchorShift([], view)).toBeNull();
  });

  it("shifts points without mutating the element", () => {
    const original = el("a", [1, 2]);
    const moved = shiftElement(original, { x: 10, y: 20 });
    expect(moved.points).toEqual([{ x: 11, y: 22 }]);
    expect(original.points).toEqual([{ x: 1, y: 2 }]);
  });

  describe("planDiagramCode", () => {
    const next = [el("n1", [0, 0], [100, 50]), el("n2", [200, 80], [260, 140])];

    it("replaces in place at the old diagram's corner, with no view change", () => {
      const plan = planDiagramCode({ next, replaced: [el("old", [400, 300], [500, 350])], anchored: false, viewport: view });
      expect(plan.shift).toEqual({ x: 400, y: 300 });
      expect(plan.fit).toBeNull();
    });

    it("puts new code at the viewport corner and asks to fit it", () => {
      const plan = planDiagramCode({ next, replaced: [], anchored: false, viewport: view });
      expect(plan.shift).toEqual({ x: 180, y: 130 });
      expect(plan.fit).toEqual({ minX: 180, minY: 130, maxX: 440, maxY: 270, width: 260, height: 140 });
    });

    it("leaves anchored elements where they are", () => {
      const plan = planDiagramCode({ next, replaced: [], anchored: true, viewport: view });
      expect(plan.shift).toEqual({ x: 0, y: 0 });
      expect(plan.fit).toMatchObject({ minX: 0, minY: 0, maxX: 260, maxY: 140 });
    });
  });
});

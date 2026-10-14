import { describe, expect, it } from "vitest";
import { resizeBox, resizePaddedBox } from "./resize-box";
import { resizeRectangle } from "@/core/shapes/rectangle/interaction";
import { resizeDiamond } from "@/core/shapes/diamond/interaction";
import { resizeTriangle } from "@/core/shapes/triangle/interaction";
import { resizeCircle } from "@/core/shapes/circle/interaction";
import { resizeSemanticNode } from "@/core/shapes/semantic-node/interaction";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";

const box = { minX: 100, minY: 100, maxX: 300, maxY: 200 };
const min = { width: 20, height: 20 };

describe("resizeBox", () => {
  it("moves only the edges a handle controls", () => {
    expect(resizeBox(box, "e", { x: 350, y: 999 }, min)).toEqual({ ...box, maxX: 350 });
    expect(resizeBox(box, "n", { x: 999, y: 60 }, min)).toEqual({ ...box, minY: 60 });
    expect(resizeBox(box, "se", { x: 400, y: 260 }, min)).toEqual({ ...box, maxX: 400, maxY: 260 });
    expect(resizeBox(box, "nw", { x: 50, y: 40 }, min)).toEqual({ ...box, minX: 50, minY: 40 });
  });

  it("stops the dragged edge at the minimum size and leaves the opposite edge alone", () => {
    // Dragging the west handle far past the east edge used to push the east edge along.
    expect(resizeBox(box, "w", { x: 900, y: 0 }, min)).toEqual({ ...box, minX: 280 });
    expect(resizeBox(box, "n", { x: 0, y: 900 }, min)).toEqual({ ...box, minY: 180 });
    expect(resizeBox(box, "e", { x: -900, y: 0 }, min)).toEqual({ ...box, maxX: 120 });
    expect(resizeBox(box, "s", { x: 0, y: -900 }, min)).toEqual({ ...box, maxY: 120 });
    expect(resizeBox(box, "nw", { x: 900, y: 900 }, min)).toEqual({ ...box, minX: 280, minY: 180 });
    expect(resizeBox(box, "se", { x: -900, y: -900 }, min)).toEqual({ ...box, maxX: 120, maxY: 120 });
  });

  it("never lets either dimension fall below the minimum, for any handle and point", () => {
    const handles = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
    for (const handle of handles) {
      for (const x of [-500, 0, 150, 300, 700]) {
        for (const y of [-500, 0, 150, 300, 700]) {
          const r = resizeBox(box, handle, { x, y }, min)!;
          expect(r.maxX - r.minX).toBeGreaterThanOrEqual(min.width);
          expect(r.maxY - r.minY).toBeGreaterThanOrEqual(min.height);
        }
      }
    }
  });

  it("returns null for an unknown handle", () => {
    expect(resizeBox(box, "middle", { x: 0, y: 0 }, min)).toBeNull();
  });
});

describe("resizePaddedBox", () => {
  it("measures from the stroke edge and returns the inner box", () => {
    // stroke 4 => padding 2; the handle sits on the padded frame
    expect(resizePaddedBox(box, 2, "e", { x: 352, y: 0 }, 10)).toEqual({ ...box, maxX: 350 });
  });
});

describe("shapes use the shared clamping", () => {
  const bounds: Bounds = { ...box, width: 200, height: 100 };
  const corners = (shape: { points: Array<{ x: number; y: number }> }) => ({
    minX: Math.min(...shape.points.map((p) => p.x)),
    maxX: Math.max(...shape.points.map((p) => p.x)),
  });
  const base = {
    id: "s", color: "#000", strokeWidth: 2,
    points: [{ x: 100, y: 100 }, { x: 300, y: 200 }],
  };

  it.each([
    ["rectangle", () => resizeRectangle({ ...base, type: "rectangle" }, "w", { x: 900, y: 0 }, bounds)],
    ["diamond", () => resizeDiamond({ ...base, type: "diamond" }, "w", { x: 900, y: 0 }, bounds)],
    ["triangle", () => resizeTriangle({ ...base, type: "triangle" }, "w", { x: 900, y: 0 }, bounds)],
    ["semantic node", () => resizeSemanticNode({ ...base, type: "semantic-node" }, "w", { x: 900, y: 0 }, bounds)],
  ])("%s keeps its east edge when the west handle is dragged past it", (_name, run) => {
    expect(corners(run()).maxX).toBe(300);
  });

  it("circle stays a circle and keeps its east edge", () => {
    const circle = resizeCircle(
      { id: "c", type: "circle", color: "#000", strokeWidth: 2, points: [{ x: 200, y: 150 }, { x: 250, y: 150 }] },
      "w",
      { x: 900, y: 0 },
      { minX: 150, minY: 100, maxX: 250, maxY: 200, width: 100, height: 100 },
    );
    const [center, edge] = circle.points;
    expect(center.x + Math.hypot(edge.x - center.x, edge.y - center.y)).toBeCloseTo(250, 5);
    expect(Math.hypot(edge.x - center.x, edge.y - center.y)).toBeGreaterThan(0);
  });
});

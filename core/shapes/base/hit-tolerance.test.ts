import { describe, expect, it } from "vitest";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import { screenTolerance } from "./shape-geometry-utils";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const line = (type: "line" | "freehand" | "arrow"): DrawingElement =>
  ({ id: "l", type, color: "#000", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }) as DrawingElement;
const hit = (el: DrawingElement, distance: number, zoom: number) =>
  getShapeDefinition(el.type)!.containsPoint!(el as never, { x: 50, y: distance }, { zoom });

describe("screenTolerance", () => {
  it("is the pixel size divided by zoom, and ignores a bad zoom", () => {
    expect(screenTolerance(10, 2)).toBe(5);
    expect(screenTolerance(10, 0.25)).toBe(40);
    expect(screenTolerance(10, 0)).toBe(10);
    expect(screenTolerance(10, NaN)).toBe(10);
    expect(screenTolerance(10)).toBe(10);
  });
});

describe.each(["line", "freehand", "arrow"] as const)("%s hit test is a constant number of screen pixels", (type) => {
  it("is as forgiving zoomed out as zoomed in, in pixels", () => {
    const el = line(type);
    expect(hit(el, 6, 1)).toBe(true); // 6 px away at 100%
    expect(hit(el, 6, 4)).toBe(false); // 24 px away at 400%: a miss
    expect(hit(el, 30, 0.25)).toBe(true); // 7.5 px away at 25%: still a hit
    expect(hit(el, 30, 1)).toBe(false);
  });
});

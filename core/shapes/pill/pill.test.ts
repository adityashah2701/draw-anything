import { describe, expect, it } from "vitest";
import { getShapeAnchors, getShapeBounds, getShapeDefinition, resizeShape, shapeContainsPoint } from "@/core/shapes/shape-runtime";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { getPillResizeHandles } from "./interaction";
import type { PillShape } from "./types";

const pill = (points = [{ x: 0, y: 0 }, { x: 200, y: 60 }]): PillShape => ({ id: "p", type: "pill", color: "#000", strokeWidth: 2, points });
const asEl = (s: PillShape) => s as DrawingElement;

describe("pill shape", () => {
  it("is registered, with a toolbar entry in the shapes group", () => {
    const def = getShapeDefinition("pill")!;
    expect(def.type).toBe("pill");
    expect(def.toolbarConfig).toMatchObject({ label: "Terminator", group: "shapes" });
  });

  it("has the bounds of its two points, however they are ordered", () => {
    expect(getShapeBounds(asEl(pill([{ x: 200, y: 60 }, { x: 0, y: 0 }])))).toMatchObject({ minX: 0, minY: 0, maxX: 200, maxY: 60, width: 200, height: 60 });
    expect(getShapeBounds(asEl({ ...pill(), points: [{ x: 1, y: 1 }] }))).toBeNull();
  });

  it("anchors on the four edge midpoints, which are on the outline", () => {
    const anchors = getShapeAnchors(asEl(pill()));
    const at = (side: string) => anchors.find((a) => a.id.endsWith(side))!;
    expect([at("top").x, at("top").y]).toEqual([100, 0]);
    expect([at("right").x, at("right").y]).toEqual([200, 30]);
    expect([at("bottom").x, at("bottom").y]).toEqual([100, 60]);
    expect([at("left").x, at("left").y]).toEqual([0, 30]);
  });

  it("hit-tests the stadium, not its bounding box", () => {
    const p = asEl(pill());
    expect(shapeContainsPoint(p, { x: 100, y: 30 })).toBe(true);
    expect(shapeContainsPoint(p, { x: 5, y: 30 })).toBe(true); // inside the left cap
    expect(shapeContainsPoint(p, { x: 1, y: 1 })).toBe(false); // the corner a rectangle test would hit
    expect(shapeContainsPoint(p, { x: 199, y: 59 })).toBe(false);
    expect(shapeContainsPoint(p, { x: 250, y: 30 })).toBe(false);
  });

  it("applies the tolerance radius around the outline", () => {
    const p = asEl(pill());
    expect(shapeContainsPoint(p, { x: 204, y: 30 }, { radius: 5 })).toBe(true);
    expect(shapeContainsPoint(p, { x: 210, y: 30 }, { radius: 5 })).toBe(false);
  });

  it("hit-tests a tall pill along its height", () => {
    const tall = asEl(pill([{ x: 0, y: 0 }, { x: 60, y: 200 }]));
    expect(shapeContainsPoint(tall, { x: 30, y: 195 })).toBe(true);
    expect(shapeContainsPoint(tall, { x: 1, y: 1 })).toBe(false);
  });

  it("offers eight resize handles around the stroke-padded box", () => {
    const handles = getPillResizeHandles(pill(), getShapeBounds(asEl(pill())));
    expect(handles.map((h) => h.name)).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
    expect(handles[0]).toMatchObject({ x: -1, y: -1 });
  });

  it("resizes from a handle and keeps a minimum size", () => {
    const bounds = getShapeBounds(asEl(pill()))!;
    const wider = resizeShape(asEl(pill()), "e", { x: 300, y: 30 }, bounds) as PillShape;
    expect(wider.points[1].x).toBeGreaterThan(290);
    const crushed = resizeShape(asEl(pill()), "e", { x: -500, y: 30 }, bounds) as PillShape;
    // The 10-unit minimum includes the 2-unit stroke, as for the other shapes.
    expect(Math.abs(crushed.points[1].x - crushed.points[0].x) + 2).toBeGreaterThanOrEqual(10);
  });
});

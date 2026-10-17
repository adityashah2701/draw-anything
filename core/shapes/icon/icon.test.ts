import { describe, expect, it } from "vitest";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import { MIN_ICON_SIZE } from "./interaction";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const icon = (over: Partial<DrawingElement> = {}): DrawingElement =>
  ({ id: "i", type: "icon", color: "#475569", strokeWidth: 2, points: [{ x: 10, y: 20 }, { x: 74, y: 84 }], ai: { icon: "database" }, ...over }) as DrawingElement;
const def = () => getShapeDefinition("icon")!;

describe("icon shape", () => {
  it("is registered, connectable and resizable, with no toolbar tool and no label", () => {
    expect(def().type).toBe("icon");
    expect(def().toolbarConfig).toBeUndefined();
    expect(def().labelConfig).toBeUndefined();
  });

  it("has the bounds of its two points and four anchors on its edges", () => {
    const el = icon();
    const bounds = def().getBounds(el as never)!;
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual([10, 20, 74, 84]);
    const anchors = def().getAnchors!(el as never, bounds);
    expect(anchors.map((a) => a.side).sort()).toEqual(["bottom", "left", "right", "top"]);
  });

  it("is hit anywhere inside its box, and not outside", () => {
    expect(def().containsPoint!(icon() as never, { x: 40, y: 50 })).toBe(true); // inside, on empty glyph space
    expect(def().containsPoint!(icon() as never, { x: 80, y: 50 })).toBe(false);
    expect(def().containsPoint!(icon() as never, { x: 80, y: 50 }, { radius: 8 })).toBe(true);
  });

  it("resizes from a corner and never below the minimum", () => {
    const el = icon();
    const bounds = def().getBounds(el as never)!;
    const grown = def().onResize!(el as never, "se", { x: 200, y: 200 }, bounds) as unknown as DrawingElement;
    expect(grown.points[1].x).toBeGreaterThan(150);
    const crushed = def().onResize!(el as never, "se", { x: 11, y: 21 }, bounds) as unknown as DrawingElement;
    expect(crushed.points[1].x - crushed.points[0].x).toBeGreaterThanOrEqual(MIN_ICON_SIZE);
  });

  it("draws only the glyph: one stroked path per glyph shape and no tile", () => {
    const calls: string[] = [];
    const sink = new Proxy(
      {},
      {
        get: (_t, name: string) =>
          name === "isPathDataSink" ? true : name === "measureText" ? () => ({ width: 1 }) : (..._a: unknown[]) => void calls.push(name),
        set: () => true,
      },
    );
    def().renderToCanvas!(icon() as never, { ctx: sink as unknown as CanvasRenderingContext2D, zoom: 1, panOffset: { x: 0, y: 0 }, getElementBounds: () => null, editingTextId: null } as never);
    expect(calls.filter((c) => c === "strokePathData")).toHaveLength(3); // the database glyph has three shapes
    expect(calls).not.toContain("roundRect"); // no tile for a line icon
    expect(calls).not.toContain("fillText");
  });
});

import { describe, expect, it } from "vitest";
import { getShapeAnchors, getShapeBounds, getShapeDefinition, getShapeHitBounds, moveShape, resizeShape, createShape } from "@/core/shapes/shape-runtime";
import { frame } from "@/core/frames/test-helpers";
import { SvgContext } from "@/features/whiteboard/export/svg-context";

const def = () => getShapeDefinition("frame")!;

describe("the frame shape definition", () => {
  it("is registered, creates a valid frame and is not connectable, rotatable or labelable", () => {
    expect(def()).toBeDefined();
    const created = createShape("frame", { id: "f", title: "Auth" })!;
    expect(created).toMatchObject({ id: "f", type: "frame", title: "Auth" });
    expect(def().validate!(created)).toBe(true);
    expect(def().capabilities).toEqual(expect.arrayContaining(["movable", "resizable"]));
    expect(def().capabilities).not.toContain("connectable");
    expect(def().capabilities).not.toContain("rotatable");
    expect(def().capabilities).not.toContain("labelable");
    expect(getShapeAnchors(frame("f", 0, 0, 100, 100))).toEqual([]);
  });

  it("is a toolbar tool in the shapes group with the O shortcut", () => {
    expect(def().toolbarConfig).toMatchObject({ label: "Frame", shortcut: "O", group: "shapes" });
  });

  it("rejects a frame with no usable box", () => {
    expect(def().validate!(frame("f", 0, 0, 0, 0))).toBe(false);
    expect(def().validate!({ ...frame("f", 0, 0), points: [] })).toBe(false);
  });

  it("has the box as its bounds and moves by translating both corners", () => {
    const f = frame("f", 10, 20, 100, 50);
    expect(getShapeBounds(f)).toMatchObject({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    expect(moveShape(f, { x: 5, y: -5 }).points).toEqual([{ x: 15, y: 15 }, { x: 115, y: 65 }]);
  });

  it("can be picked on its tab, so the tab is part of its hit area but not of its bounds", () => {
    const tabbed = frame("f", 0, 0, 400, 300, { titlePlacement: "above" });
    expect(getShapeBounds(tabbed)!.minY).toBe(0);
    expect(getShapeHitBounds(tabbed)!.minY).toBe(-24);
    expect(getShapeHitBounds(frame("f", 0, 0, 400, 300))).toEqual(getShapeBounds(frame("f", 0, 0, 400, 300)));
  });

  describe("picking", () => {
    const f = frame("f", 0, 0, 400, 300, { title: "Auth" });
    const hit = (x: number, y: number, radius = 0) => def().containsPoint!(f, { x, y }, { radius });

    it("picks the header and the border but not the interior", () => {
      expect(hit(200, 10)).toBe(true); // header band
      expect(hit(0, 200)).toBe(true); // left border
      expect(hit(400, 200)).toBe(true);
      expect(hit(200, 300)).toBe(true);
      expect(hit(200, 150)).toBe(false); // interior belongs to the contents
      expect(hit(500, 150)).toBe(false);
    });

    it("picks an above tab outside the box", () => {
      const tabbed = frame("f", 0, 0, 400, 300, { title: "Auth", titlePlacement: "above" });
      expect(def().containsPoint!(tabbed, { x: 20, y: -10 }, {})).toBe(true);
      expect(def().containsPoint!(tabbed, { x: 390, y: -10 }, {})).toBe(false);
      expect(def().containsPoint!(tabbed, { x: 200, y: 150 }, {})).toBe(false);
    });

    it("widens the border with the hit tolerance", () => {
      expect(hit(-4, 200, 6)).toBe(true);
      expect(hit(-20, 200, 6)).toBe(false);
    });
  });

  describe("resizing", () => {
    it("offers eight handles, none for an auto-fit frame", () => {
      expect(def().getResizeHandles!(frame("f", 0, 0, 100, 100)).map((h) => h.name).sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
      expect(def().getResizeHandles!(frame("f", 0, 0, 100, 100, { autoFit: true }))).toEqual([]);
    });

    it("resizes by a handle, stops at the minimum size and ignores auto-fit frames", () => {
      const f = frame("f", 0, 0, 400, 300);
      const bounds = getShapeBounds(f)!;
      expect(frameBoxOf(resizeShape(f, "se", { x: 500, y: 400 }, bounds))).toMatchObject({ maxX: 500, maxY: 400, minX: 0 });
      expect(frameBoxOf(resizeShape(f, "se", { x: 5, y: 5 }, bounds))).toMatchObject({ width: 80, height: 60 });
      const fit = frame("f", 0, 0, 400, 300, { autoFit: true });
      expect(resizeShape(fit, "se", { x: 500, y: 400 }, getShapeBounds(fit)!)).toEqual(fit);
    });
  });
});

const frameBoxOf = (shape: { points: Array<{ x: number; y: number }> }) => {
  const [a, b] = shape.points;
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
};

describe("drawing a frame", () => {
  const draw = (shape: ReturnType<typeof frame>) => {
    const calls: string[] = [];
    const ctx = new Proxy(
      { strokeStyle: "#000", fillStyle: "#000", globalAlpha: 1, font: "", measureText: (t: string) => ({ width: t.length * 7 }) },
      {
        get: (target, key: string) => (key in target ? (target as Record<string, unknown>)[key] : (...args: unknown[]) => void calls.push(`${key}:${args.length}`)),
        set: (target, key: string, value) => ((target as Record<string, unknown>)[key] = value, true),
      },
    ) as unknown as CanvasRenderingContext2D;
    def().renderToCanvas(shape, { ctx, zoom: 1, panOffset: { x: 0, y: 0 }, getElementBounds: () => null });
    return calls;
  };

  it("draws a box, a header band and the title for an inside header", () => {
    const calls = draw(frame("f", 0, 0, 400, 300, { title: "Auth", fill: "#fff" }));
    expect(calls).toEqual(expect.arrayContaining(["roundRect:5", "fill:0", "clip:0", "fillRect:4", "stroke:0", "fillText:3"]));
  });

  it("draws a tab instead of a band for an above header, and no title for a hidden header", () => {
    expect(draw(frame("f", 0, 0, 400, 300, { titlePlacement: "above" }))).not.toContain("fillRect:4");
    expect(draw(frame("f", 0, 0, 400, 300, { headerVisible: false }))).not.toContain("fillText:3");
  });

  it("draws nothing for a frame with no box, and never throws", () => {
    expect(draw({ ...frame("f", 0, 0), points: [] })).toEqual([]);
  });

  it("exports to SVG through the recording context", () => {
    const svg = new SvgContext({ measureText: (t: string) => ({ width: t.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) } as never, { width: 500, height: 400 });
    svg.strokeStyle = "#475569";
    def().renderToCanvas(frame("f", 0, 0, 400, 300, { title: "Auth" }), { ctx: svg as unknown as CanvasRenderingContext2D, zoom: 1, panOffset: { x: 0, y: 0 }, getElementBounds: () => null });
    expect(svg.markup().body).toContain("Auth");
  });
});

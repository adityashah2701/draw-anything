import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { rect } from "@/core/groups/test-helpers";
import {
  getShapeAnchors,
  getShapeBounds,
  getShapeLocalBounds,
  getShapeResizeHandles,
  getShapeRotation,
  isRotatable,
  moveShape,
  renderShapeToCanvas,
  resizeShape,
  shapeContainsPoint,
} from "./shape-runtime";

const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);
const turned = (degrees: number, extra: Partial<DrawingElement> = {}) => rect("r", 0, 0, 100, 50, { rotation: degrees, ...extra });

describe("which shapes rotate", () => {
  it("box-like shapes do; lines, arrows, freehand, text and legacy circles do not", () => {
    for (const type of ["rectangle", "ellipse", "diamond", "pill", "triangle", "semantic-node", "icon"] as const) expect(isRotatable(type)).toBe(true);
    for (const type of ["line", "arrow", "arrow-bidirectional", "freehand", "text", "circle"] as const) expect(isRotatable(type)).toBe(false);
  });

  it("a rotation field on a shape that cannot rotate is ignored", () => {
    const line = { id: "l", type: "line", color: "#000", strokeWidth: 2, rotation: 45, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } as DrawingElement;
    expect(getShapeRotation(line)).toBe(0);
    expect(getShapeBounds(line)).toEqual(getShapeLocalBounds(line));
  });

  it("normalises the angle and treats junk as zero", () => {
    expect(getShapeRotation(turned(450))).toBe(90);
    expect(getShapeRotation(turned(-90))).toBe(270);
    expect(getShapeRotation(turned(Number.NaN))).toBe(0);
    expect(getShapeRotation(rect("r", 0, 0))).toBe(0);
  });
});

describe("bounds", () => {
  it("are unchanged without rotation", () => {
    expect(getShapeBounds(rect("r", 10, 20, 100, 50))).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70, width: 100, height: 50 });
  });

  it("are the axis-aligned box of the rotated shape, about the same centre", () => {
    const quarter = getShapeBounds(turned(90))!;
    close(quarter.width, 50);
    close(quarter.height, 100);
    close(quarter.minX + quarter.width / 2, 50);
    close(quarter.minY + quarter.height / 2, 25);
    const diagonal = getShapeBounds(turned(45))!;
    close(diagonal.width, (100 + 50) / Math.SQRT2, 5);
    close(diagonal.height, (100 + 50) / Math.SQRT2, 5);
  });

  it("keep the unrotated box available", () => {
    expect(getShapeLocalBounds(turned(90))).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 });
  });
});

describe("hit-testing", () => {
  it("follows the rotated outline, not the old box", () => {
    const shape = turned(90); // now 50 wide and 100 tall around (50, 25)
    expect(shapeContainsPoint(shape, { x: 50, y: -20 })).toBe(true); // above the old box, inside the turned one
    expect(shapeContainsPoint(shape, { x: 5, y: 25 })).toBe(false); // inside the old box, outside the turned one
    expect(shapeContainsPoint(shape, { x: 50, y: 25 })).toBe(true);
  });

  it("honours the pick radius", () => {
    const shape = turned(90);
    expect(shapeContainsPoint(shape, { x: 50, y: -28 }, { radius: 5 })).toBe(true);
    expect(shapeContainsPoint(shape, { x: 50, y: -40 }, { radius: 5 })).toBe(false);
  });

  it("is unchanged for an unrotated shape", () => {
    expect(shapeContainsPoint(rect("r", 0, 0, 100, 50), { x: 99, y: 49 })).toBe(true);
    expect(shapeContainsPoint(rect("r", 0, 0, 100, 50), { x: 101, y: 49 })).toBe(false);
  });
});

describe("anchors", () => {
  it("move with the outline but keep their ids, and report the side they now face", () => {
    const anchors = getShapeAnchors(turned(90));
    const top = anchors.find((a) => a.id === "r-anchor-top")!;
    close(top.x, 75);
    close(top.y, 25);
    expect(top.side).toBe("right");
    expect(anchors.find((a) => a.id === "r-anchor-left")!.side).toBe("top");
    expect(anchors.map((a) => a.id).sort()).toEqual(getShapeAnchors(turned(0)).map((a) => a.id).sort());
  });

  it("ignore a caller's bounds when rotated (they would be the axis-aligned box)", () => {
    const shape = turned(90);
    const withBounds = getShapeAnchors(shape, getShapeBounds(shape));
    expect(withBounds).toEqual(getShapeAnchors(shape));
  });

  it("are unchanged without rotation", () => {
    const [top] = getShapeAnchors(rect("r", 0, 0, 100, 50));
    expect(top).toMatchObject({ x: 50, y: 0, side: "top" });
  });

  it("snap to the nearest side at an angle between quarter turns", () => {
    const sides = getShapeAnchors(turned(40)).map((a) => [a.id.split("-").pop(), a.side]);
    expect(sides).toContainEqual(["top", "top"]);
    expect(getShapeAnchors(turned(50)).find((a) => a.id.endsWith("top"))!.side).toBe("right");
  });
});

describe("resize handles", () => {
  it("sit on the rotated corners and edges", () => {
    const handles = getShapeResizeHandles(turned(90), { bounds: getShapeBounds(turned(90)) });
    const east = handles.find((h) => h.name === "e")!;
    // unrotated it is at (101, 25), one stroke-half outside the edge; a quarter turn puts it straight below the centre
    close(east.x, 50);
    close(east.y, 25 + 51);
    expect(handles).toHaveLength(8);
  });
});

describe("resizing a rotated shape", () => {
  const worldOf = (shape: DrawingElement, name: string) => {
    const h = getShapeResizeHandles(shape, { bounds: getShapeBounds(shape) }).find((handle) => handle.name === name)!;
    return { x: h.x, y: h.y };
  };
  const opposite: Record<string, string> = { n: "s", s: "n", e: "w", w: "e", ne: "sw", sw: "ne", nw: "se", se: "nw" };

  it.each([0, 30, 90, 135, 200])("keeps the opposite handle where it was on screen (rotation %i)", (degrees) => {
    for (const handle of Object.keys(opposite)) {
      const shape = turned(degrees);
      const before = worldOf(shape, opposite[handle]);
      const grab = worldOf(shape, handle);
      // drag the handle 30 units further out along its own direction
      const target = { x: grab.x + Math.cos((degrees * Math.PI) / 180) * 30, y: grab.y + Math.sin((degrees * Math.PI) / 180) * 30 };
      const resized = resizeShape(shape, handle, target, getShapeLocalBounds(shape)!);
      const after = worldOf(resized, opposite[handle]);
      close(after.x, before.x, 4);
      close(after.y, before.y, 4);
      expect(resized.rotation).toBe(degrees);
    }
  });

  it("grows by the pointer travel measured in the shape's own frame", () => {
    const shape = turned(90);
    const grab = worldOf(shape, "e"); // after 90 degrees the east handle faces down
    const resized = resizeShape(shape, "e", { x: grab.x, y: grab.y + 20 }, getShapeLocalBounds(shape)!);
    close(getShapeLocalBounds(resized)!.width, 100 + 20, 4);
    close(getShapeLocalBounds(resized)!.height, 50);
  });

  it("does nothing when the handle is dropped where it already is", () => {
    const shape = turned(60);
    const grab = worldOf(shape, "se");
    const resized = resizeShape(shape, "se", grab, getShapeLocalBounds(shape)!);
    resized.points.forEach((p, i) => {
      close(p.x, shape.points[i].x, 4);
      close(p.y, shape.points[i].y, 4);
    });
  });

  it("is the plain resize without rotation", () => {
    const shape = rect("r", 0, 0, 100, 50);
    const resized = resizeShape(shape, "se", { x: 150, y: 90 }, getShapeLocalBounds(shape)!);
    expect(getShapeLocalBounds(resized)).toMatchObject({ minX: 0, minY: 0 });
    expect(resized.rotation).toBeUndefined();
  });
});

describe("moving", () => {
  it("keeps the rotation", () => {
    const moved = moveShape(turned(33), { x: 10, y: -4 });
    expect(moved.rotation).toBe(33);
    expect(moved.points[0]).toEqual({ x: 10, y: -4 });
  });
});

describe("drawing", () => {
  const recorder = () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, name: string) => {
          if (name === "canvas") return { width: 100, height: 100 };
          return (...args: unknown[]) => {
            calls.push(`${name}(${args.map((a) => (typeof a === "number" ? Math.round(a * 1000) / 1000 : "")).join(",")})`);
            return { width: 10 };
          };
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    return { calls, ctx };
  };
  const context = (ctx: CanvasRenderingContext2D) => ({ ctx, zoom: 2, panOffset: { x: 10, y: 20 }, getElementBounds: () => null });

  it("rotates the canvas about the shape's centre for the duration of the draw", () => {
    const { calls, ctx } = recorder();
    renderShapeToCanvas(turned(90), context(ctx));
    const rotate = calls.findIndex((c) => c.startsWith("rotate("));
    expect(rotate).toBeGreaterThan(-1);
    expect(calls[rotate]).toBe(`rotate(${Math.round(((90 * Math.PI) / 180) * 1000) / 1000})`);
    expect(calls[rotate - 2]).toBe("save()");
    // centre (50,25) -> screen (110, 70)
    expect(calls[rotate - 1]).toBe("translate(110,70)");
    expect(calls.lastIndexOf("restore()")).toBeGreaterThan(rotate);
  });

  it("does not touch the transform for an unrotated shape", () => {
    const { calls, ctx } = recorder();
    renderShapeToCanvas(rect("r", 0, 0, 100, 50), context(ctx));
    expect(calls.some((c) => c.startsWith("rotate(") || c.startsWith("translate("))).toBe(false);
  });

  it("restores the canvas even if drawing throws", () => {
    const { calls, ctx } = recorder();
    const broken = new Proxy(ctx, {
      get: (target, name: string) => {
        if (name === "roundRect") return () => { throw new Error("boom"); };
        return (target as never as Record<string, unknown>)[name];
      },
    });
    expect(() => renderShapeToCanvas(turned(30), context(broken))).toThrow("boom");
    expect(calls[calls.length - 1]).toBe("restore()");
  });
});

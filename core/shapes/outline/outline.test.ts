import { afterEach, describe, expect, it, vi } from "vitest";
import { createShape, getShapeAnchors, getShapeBounds, getShapeDefinition, getShapeResizeHandles, resizeShape, shapeContainsPoint } from "@/core/shapes/shape-runtime";
import { getToolDefinitions } from "@/core/shapes/shape-tool-registry";
import { getShapeLabelRegion } from "@/core/text/label-region";
import { sizeOutlineNode } from "@/core/text/node-size";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { outlineIconPaths } from "./icon";
import { distanceToPolygonEdge, flattenPath } from "./path";
import { renderOutlineToCanvas } from "./renderer";
import type { OutlineShape } from "./types";
import {
  describeOutlineVariants,
  getOutlineVariant,
  isOutlineVariantId,
  listOutlineVariants,
  outlineToolName,
  outlineVariantIds,
  outlineVariantOfTool,
  resetUnknownVariantWarnings,
  resolveOutlineVariant,
} from "./variants";

const outline = (variant: string, points = [{ x: 100, y: 50 }, { x: 300, y: 170 }]): OutlineShape =>
  ({ id: "o1", type: "outline", variant, color: "#000", strokeWidth: 2, points }) as OutlineShape;
const asEl = (s: OutlineShape) => s as DrawingElement;
const VARIANTS = listOutlineVariants();
const SIZES: Array<[number, number]> = [[200, 120], [60, 60], [400, 80], [90, 300]];

afterEach(() => {
  vi.restoreAllMocks();
  resetUnknownVariantWarnings();
});

describe("variant registry", () => {
  it("lists the five outlines, with unique ids and the data every consumer needs", () => {
    expect(outlineVariantIds()).toEqual(["cylinder", "cloud", "document", "hexagon", "parallelogram"]);
    expect(new Set(outlineVariantIds()).size).toBe(VARIANTS.length);
    for (const v of VARIANTS) {
      expect(v.label).not.toBe("");
      expect(v.description).not.toBe("");
      expect(v.defaultSize.width).toBeGreaterThan(0);
      expect(v.path(100, 80).length).toBeGreaterThan(3);
    }
  });

  it("gives the agent plain data to discover variants", () => {
    const info = describeOutlineVariants();
    expect(info.map((i) => i.id)).toEqual(outlineVariantIds());
    expect(JSON.parse(JSON.stringify(info))).toEqual(info);
    expect(isOutlineVariantId("cloud")).toBe(true);
    expect(isOutlineVariantId("teapot")).toBe(false);
    expect(getOutlineVariant("teapot")).toBeUndefined();
  });

  it("derives one draw tool per variant, with an icon", () => {
    const tools = getToolDefinitions().filter((t) => t.group === "outline");
    expect(tools.map((t) => t.name)).toEqual(outlineVariantIds().map(outlineToolName));
    for (const tool of tools) expect(tool.icon).toBeTruthy();
    expect(outlineVariantOfTool("outline:hexagon")).toBe("hexagon");
    expect(outlineVariantOfTool("rectangle")).toBeNull();
  });

  it("derives a picker icon from the geometry", () => {
    for (const v of VARIANTS) {
      const paths = outlineIconPaths(v.id);
      expect(paths[0]).toMatch(/^M/);
      expect(paths[0]).toMatch(/Z$/);
      expect(paths.length).toBe(v.details ? 2 : 1);
    }
  });
});

describe.each(VARIANTS.map((v) => v.id))("outline variant %s", (id) => {
  it("is registered as one outline shape, created at its default size", () => {
    expect(getShapeDefinition("outline")?.type).toBe("outline");
    const made = createShape("outline", { id: "x", variant: id } as Partial<DrawingElement>)!;
    expect(made.variant).toBe(id);
    const v = getOutlineVariant(id)!;
    expect(getShapeBounds(made as DrawingElement)).toMatchObject({ width: v.defaultSize.width, height: v.defaultSize.height });
  });

  it.each(SIZES)("draws inside its bounds and fills them, at %ix%i", (w, h) => {
    const v = getOutlineVariant(id)!;
    const all = [...flattenPath(v.path(w, h)), ...(v.details ? flattenPath(v.details(w, h)) : [])];
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(w + 0.5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(h + 0.5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(w * 0.85);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(h * 0.85);
  });

  it("renders to a canvas inside the box the zoom and pan give it, filled and stroked", () => {
    const calls: string[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const record = (name: string, coords = false) => (...args: number[]) => {
      calls.push(name);
      if (coords) args.forEach((n, i) => (i % 2 === 0 ? xs : ys).push(n));
    };
    const ctx = {
      beginPath: record("begin"),
      moveTo: record("move", true),
      lineTo: record("line", true),
      bezierCurveTo: record("curve", true),
      closePath: record("close"),
      fill: record("fill"),
      stroke: record("stroke"),
    } as unknown as CanvasRenderingContext2D;
    const shape = { ...outline(id), fill: "#eee" };
    renderOutlineToCanvas(shape, { ctx, zoom: 2, panOffset: { x: 10, y: 20 } } as never);
    expect(calls).toContain("fill");
    expect(calls.filter((c) => c === "stroke").length).toBe(getOutlineVariant(id)!.details ? 2 : 1);
    // bounds (100,50)-(300,170) at zoom 2 plus the pan
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(210 - 1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(610 + 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(120 - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(360 + 1);
  });

  it("hit-tests its outline, not its bounding box", () => {
    const shape = asEl(outline(id));
    expect(shapeContainsPoint(shape, { x: 200, y: 110 })).toBe(true);
    expect(shapeContainsPoint(shape, { x: 50, y: 10 })).toBe(false);
    expect(shapeContainsPoint(shape, { x: 200, y: 400 })).toBe(false);
    // a point just off the edge is picked with a radius, not without
    expect(shapeContainsPoint(shape, { x: 99, y: 110 }, { radius: 0 })).toBe(false);
    expect(shapeContainsPoint(shape, { x: 99, y: 110 }, { radius: 40 })).toBe(true);
  });

  it("leaves the bounding-box corners to the shapes that really are empty there", () => {
    const corner = { x: 101, y: 51 };
    const emptyCorner = id !== "document";
    expect(shapeContainsPoint(asEl(outline(id)), corner)).toBe(!emptyCorner);
  });

  it("has four connector anchors on its outline, ids by side", () => {
    const shape = outline(id);
    const anchors = getShapeAnchors(asEl(shape));
    expect(anchors.map((a) => a.side).sort()).toEqual(["bottom", "left", "right", "top"]);
    expect(anchors.map((a) => a.id).sort()).toEqual(["bottom", "left", "right", "top"].map((s) => `o1-anchor-${s}`));
    const v = getOutlineVariant(id)!;
    const polygon = flattenPath(v.path(200, 120));
    for (const a of anchors) {
      expect(distanceToPolygonEdge({ x: a.x - 100, y: a.y - 50 }, polygon), `${a.side} anchor on the outline`).toBeLessThan(2.5);
    }
  });

  it("resizes from every handle, keeping the opposite edge and a minimum size", () => {
    const shape = asEl(outline(id));
    const bounds = getShapeBounds(shape)!;
    const grown = resizeShape(shape, "se", { x: 400, y: 300 }, bounds) as OutlineShape;
    expect(grown.variant).toBe(id);
    expect(getShapeBounds(asEl(grown))).toMatchObject({ minX: 100, minY: 50 });
    expect(getShapeBounds(asEl(grown))!.maxX).toBeGreaterThan(300);
    const crushed = resizeShape(shape, "nw", { x: 900, y: 900 }, bounds) as OutlineShape;
    const small = getShapeBounds(asEl(crushed))!;
    // the minimum (10) counts the stroke, as for every shape
    expect(small.width).toBeCloseTo(8, 5);
    expect(small.height).toBeCloseTo(8, 5);
    expect(small.maxX).toBe(300);
    expect(small.maxY).toBe(170);
    expect(getShapeResizeHandles(shape, { bounds })).toHaveLength(8);
  });

  it("keeps its variant through JSON, the way a board stores it", () => {
    const stored = JSON.parse(JSON.stringify({ ...outline(id), label: "Store", fill: "#fff" }));
    expect(stored).toMatchObject({ type: "outline", variant: id, label: "Store" });
    expect(getShapeBounds(stored)).toMatchObject({ width: 200, height: 120 });
    expect(getShapeAnchors(stored)).toHaveLength(4);
  });

  it("puts its label inside its bounds", () => {
    const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 120, width: 200, height: 120 };
    const region = getShapeLabelRegion("outline", bounds, undefined, id);
    expect(region.width).toBeGreaterThan(0);
    expect(region.centerX - region.width / 2).toBeGreaterThanOrEqual(-0.5);
    expect(region.centerX + region.width / 2).toBeLessThanOrEqual(200.5);
    expect(region.centerY - region.height / 2).toBeGreaterThanOrEqual(-0.5);
    expect(region.centerY + region.height / 2).toBeLessThanOrEqual(120.5);
  });

  it("is sized so its text region holds a long label", () => {
    const size = sizeOutlineNode(id, { label: "Order fulfilment service", fontSize: 17, fontWeight: "600", maxWidth: 280 });
    const region = getOutlineVariant(id)!.textRegion(size.width, size.height);
    expect(size.fits).toBe(true);
    expect(region.width).toBeGreaterThan(60);
    expect(size.width).toBeGreaterThanOrEqual(getOutlineVariant(id)!.defaultSize.width);
  });
});

describe("an unknown variant (newer data, a typo)", () => {
  it("draws as a plain rectangle outline and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const shape = asEl(outline("teapot"));
    expect(resolveOutlineVariant("teapot").id).toBe("rectangle");
    expect(getShapeBounds(shape)).toMatchObject({ width: 200, height: 120 });
    expect(shapeContainsPoint(shape, { x: 101, y: 51 })).toBe(true);
    expect(getShapeAnchors(shape)).toHaveLength(4);
    expect(() => renderOutlineToCanvas(shape as OutlineShape, { ctx: stubCtx(), zoom: 1, panOffset: { x: 0, y: 0 } } as never)).not.toThrow();
    expect(getShapeLabelRegion("outline", { minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 }, undefined, "teapot")).toMatchObject({ width: 100, height: 50 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("teapot");
  });

  it("survives a missing or malformed variant", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const variant of [undefined, null, 42, ""]) {
      const shape = { ...outline("x"), variant } as unknown as DrawingElement;
      expect(() => getShapeAnchors(shape)).not.toThrow();
      expect(shapeContainsPoint(shape, { x: 200, y: 110 })).toBe(true);
    }
    expect(createShape("outline", { id: "n" } as Partial<DrawingElement>)).toMatchObject({ type: "outline" });
  });
});

const stubCtx = () =>
  new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D;

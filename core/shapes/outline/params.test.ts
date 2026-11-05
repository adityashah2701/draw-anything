import { describe, expect, it } from "vitest";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { createShape, getShapeBounds, shapeContainsPoint } from "@/core/shapes/shape-runtime";
import { getToolDefinitions } from "@/core/shapes/shape-tool-registry";
import { SvgContext } from "@/features/whiteboard/export/svg-context";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { renderOutlineToCanvas } from "./renderer";
import type { OutlineShape } from "./types";
import { OUTLINE_VARIANTS, allOutlineVariantIds, isOutlineVariantId, listOutlineVariants, outlineVariantIds } from "./variants";

initializeShapeRegistry();

const shape = (extra: Partial<OutlineShape> = {}): OutlineShape =>
  ({ id: "o", type: "outline", variant: "ring", color: "#000000", strokeWidth: 2, fill: "#eeeeee", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], ...extra }) as OutlineShape;

/** Records canvas calls and the line widths set, so a drawing can be judged without a browser. */
const recorder = () => {
  const calls: string[] = [];
  const widths: number[] = [];
  let width = 2;
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) => (name === "lineWidth" ? width : (..._a: unknown[]) => void calls.push(name)),
      set: (_t, name: string, value: number) => {
        if (name === "lineWidth") {
          width = value;
          widths.push(value);
        }
        return true;
      },
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, widths };
};
const draw = (s: OutlineShape) => {
  const r = recorder();
  renderOutlineToCanvas(s, { ctx: r.ctx, zoom: 1, panOffset: { x: 0, y: 0 } } as never);
  return r;
};
const svgOf = (s: OutlineShape) => {
  const svg = new SvgContext({ font: "", measureText: (t: string) => ({ width: t.length * 8, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }) });
  renderOutlineToCanvas(s, { ctx: svg as unknown as CanvasRenderingContext2D, zoom: 1, panOffset: { x: 0, y: 0 } } as never);
  return svg.markup().body;
};

describe("base outlines for parametric shapes", () => {
  it("exist as outlines but are not offered as plain shapes", () => {
    for (const id of ["ring", "rhombus", "box"]) {
      expect(isOutlineVariantId(id), id).toBe(true);
      expect(allOutlineVariantIds()).toContain(id);
      expect(outlineVariantIds()).not.toContain(id);
      expect(listOutlineVariants().map((v) => v.id)).not.toContain(id);
    }
    const tools = getToolDefinitions().filter((t) => t.group === "outline").map((t) => t.name);
    expect(tools).not.toContain("outline:ring");
    expect(tools).toContain("outline:queue");
    expect(OUTLINE_VARIANTS.every((v) => !v.hidden)).toBe(true);
  });
});

describe("outline parameters", () => {
  it("keeps border, marker and stack through the registry and JSON, and adds nothing when absent", () => {
    const made = createShape("outline", { id: "x", variant: "ring", border: "double", marker: "clock", stack: true } as Partial<DrawingElement>) as OutlineShape;
    expect(made).toMatchObject({ border: "double", marker: "clock", stack: true });
    expect(JSON.parse(JSON.stringify(made))).toMatchObject({ border: "double", marker: "clock", stack: true });
    const plain = createShape("outline", { id: "y", variant: "ring" } as Partial<DrawingElement>) as unknown as Record<string, unknown>;
    for (const key of ["border", "marker", "stack"]) expect(key in plain && plain[key] !== undefined).toBe(false);
  });

  it("draws a double border as a second outline inside the first, and a thick border with a heavier line", () => {
    const single = draw(shape());
    const double = draw(shape({ border: "double" }));
    expect(double.calls.filter((c) => c === "stroke").length).toBe(single.calls.filter((c) => c === "stroke").length + 1);
    const thick = draw(shape({ border: "thick" }));
    expect(Math.max(...thick.widths)).toBeGreaterThan(2);
    expect(thick.widths[thick.widths.length - 1]).toBe(2); // the width is put back
    expect(single.widths.every((w) => w <= 2)).toBe(true);
  });

  it("draws the marker inside the shape, in the SVG as well", () => {
    expect(svgOf(shape({ marker: "clock" }))).toMatch(/A\d/);
    const none = svgOf(shape());
    const withCross = svgOf(shape({ marker: "cross" }));
    expect((withCross.match(/<path/g) ?? []).length).toBeGreaterThan((none.match(/<path/g) ?? []).length);
  });

  it("draws a stack as copies behind the front shape, filled in turn", () => {
    const plain = draw(shape({ variant: "cylinder" }));
    const stacked = draw(shape({ variant: "cylinder", stack: true }));
    expect(stacked.calls.filter((c) => c === "fill").length).toBe(plain.calls.filter((c) => c === "fill").length + 2);
  });

  it("keeps every drawing inside the box it was given", () => {
    const xs: number[] = [];
    const ys: number[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, name: string) => (...args: number[]) => {
          if (["moveTo", "lineTo", "bezierCurveTo", "quadraticCurveTo"].includes(name)) args.forEach((n, i) => (i % 2 === 0 ? xs : ys).push(n));
          if (name === "arc") {
            xs.push(args[0] - args[2], args[0] + args[2]);
            ys.push(args[1] - args[2], args[1] + args[2]);
          }
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    renderOutlineToCanvas(shape({ variant: "cylinder", border: "double", marker: "bullseye", stack: true, label: "" }), { ctx, zoom: 1, panOffset: { x: 0, y: 0 } } as never);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100.5);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100.5);
  });

  it("is picked by its outline, stacked or not, and keeps its bounds", () => {
    const s = shape({ variant: "cylinder", stack: true, border: "double" }) as DrawingElement;
    expect(shapeContainsPoint(s, { x: 50, y: 50 })).toBe(true);
    expect(shapeContainsPoint(s, { x: 150, y: 50 })).toBe(false);
    expect(getShapeBounds(s)).toMatchObject({ width: 100, height: 100 });
  });

  it("moves a marker above the label when a shape has both, and centres it otherwise", () => {
    const arcY = (s: OutlineShape) => {
      const ys: number[] = [];
      const ctx = new Proxy(
        {},
        {
          get: (_t, name: string) => (...args: number[]) => {
            if (name === "arc") ys.push(args[1]);
            if (name === "measureText") return { width: String(args[0]).length * 8, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 };
          },
          set: () => true,
        },
      ) as unknown as CanvasRenderingContext2D;
      renderOutlineToCanvas(s, { ctx, zoom: 1, panOffset: { x: 0, y: 0 } } as never);
      return ys[0];
    };
    expect(arcY(shape({ marker: "dot" }))).toBeCloseTo(50, 1);
    expect(arcY(shape({ marker: "dot", label: "Start" }))).toBeLessThan(35);
  });
});

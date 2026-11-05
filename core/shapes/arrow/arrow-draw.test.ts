import { describe, expect, it } from "vitest";
import { drawArrow } from "@/core/shapes/arrow/arrow-utils";
import { SvgContext } from "@/features/whiteboard/export/svg-context";
import type { ArrowShape } from "@/core/shapes/arrow/types";

const measurer = { font: "", measureText: (text: string) => ({ width: text.length * 8, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }) };
const arrow = (extra: Partial<ArrowShape> = {}): ArrowShape =>
  ({
    id: "a",
    type: "arrow",
    color: "#000000",
    strokeWidth: 2,
    routingMode: "orthogonal",
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    ...extra,
  }) as ArrowShape;

/** Records every canvas call in order, so a drawing can be compared without a browser. */
const recorder = () => {
  const calls: Array<[string, ...number[]]> = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) => (...args: number[]) => {
        calls.push([name, ...args.filter((a) => typeof a === "number")]);
      },
      set: () => true,
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};

const svgOf = (element: ArrowShape) => {
  const svg = new SvgContext(measurer);
  drawArrow(svg as unknown as CanvasRenderingContext2D, element, 1, { x: 0, y: 0 });
  return svg.markup().body;
};

describe("drawArrow corners", () => {
  it("draws an arrow with no corner radius exactly as before: straight segments, no curves", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow(), 1, { x: 0, y: 0 });
    const line = calls.filter(([n]) => n === "lineTo" || n === "moveTo" || n === "quadraticCurveTo").slice(0, 3);
    expect(line).toEqual([["moveTo", 0, 0], ["lineTo", 100, 0], ["lineTo", 100, 100]]);
    expect(calls.some(([n]) => n === "quadraticCurveTo")).toBe(false);
  });

  it("rounds each bend of an elbow arrow that has a corner radius", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow({ cornerRadius: 16 }), 1, { x: 0, y: 0 });
    expect(calls).toContainEqual(["quadraticCurveTo", 100, 0, 100, 16]);
    expect(calls).toContainEqual(["lineTo", 84, 0]);
  });

  it("scales the radius with the zoom so a corner looks the same at every zoom", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow({ cornerRadius: 16 }), 2, { x: 0, y: 0 });
    expect(calls).toContainEqual(["quadraticCurveTo", 200, 0, 200, 32]);
  });

  it("keeps straight arrows straight whatever the radius", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow({ routingMode: "straight", cornerRadius: 16 }), 1, { x: 0, y: 0 });
    expect(calls.some(([n]) => n === "quadraticCurveTo")).toBe(false);
  });

  it("does not change where the arrowhead points: it follows the last real segment", () => {
    const sharp = recorder();
    const round = recorder();
    drawArrow(sharp.ctx, arrow(), 1, { x: 0, y: 0 });
    drawArrow(round.ctx, arrow({ cornerRadius: 16 }), 1, { x: 0, y: 0 });
    const headOf = (calls: Array<[string, ...number[]]>) => calls.filter(([n]) => n === "moveTo" || n === "lineTo").slice(-3);
    expect(headOf(round.calls)).toEqual(headOf(sharp.calls));
  });

  it("exports rounded corners as curve commands in the SVG, with nothing unsupported", () => {
    const body = svgOf(arrow({ cornerRadius: 16 }));
    expect(body).toMatch(/Q100 0 100 16/);
    expect(body).not.toContain("<image");
  });
});

describe("drawArrow heads", () => {
  it("draws crow's-foot prongs for a many end and the same prongs in the SVG", () => {
    const body = svgOf(arrow({ headEnd: "crow-many" }));
    expect(body.match(/L/g)!.length).toBeGreaterThanOrEqual(5);
    expect(body).toContain("100 100");
  });

  it("draws an optional end with a circle", () => {
    expect(svgOf(arrow({ headEnd: "crow-zero-many" }))).toMatch(/A\d/);
  });

  it("stops the line at the base of a hollow head so the line is not drawn through it", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow({ headEnd: "hollow-triangle" }), 1, { x: 0, y: 0 });
    expect(calls).toContainEqual(["lineTo", 100, 88]); // the last point (100, 100) pulled back by the head length
    expect(calls).not.toContainEqual(["lineTo", 100, 100]);
  });

  it("points a head along the last segment when that segment is at least five long", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 5 }], headEnd: "diamond" }), 1, { x: 0, y: 0 });
    const xs = calls.filter(([n]) => n === "lineTo").map(([, x]) => x);
    expect(xs.some((x) => x === 100)).toBe(true);
  });

  it("draws the default triangle when no head kind is stored", () => {
    const { ctx, calls } = recorder();
    drawArrow(ctx, arrow(), 1, { x: 0, y: 0 });
    expect(calls.some(([n]) => n === "fill")).toBe(true);
  });
});

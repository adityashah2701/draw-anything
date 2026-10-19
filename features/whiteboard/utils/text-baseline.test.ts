import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { createBaselineResolver } from "./text-baseline";

const text = (over: Partial<DrawingElement> = {}) =>
  ({ id: "t", type: "text", text: "Hello", fontSize: 20, color: "#000", strokeWidth: 1, points: [{ x: 10, y: 100 }], ...over }) as DrawingElement;

/** A context whose font has ascent 16 and descent 4 at 20px, scaled with the size. */
const fakeContext = () => {
  const ctx = {
    font: "",
    textBaseline: "alphabetic" as CanvasTextBaseline,
    measureText: () => {
      const size = Number(/(\d+(\.\d+)?)px/.exec(ctx.font)?.[1] ?? 0);
      return { fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 } as TextMetrics;
    },
  };
  return ctx;
};

describe("createBaselineResolver", () => {
  it("puts the baseline below the text's top by the font's first-line offset", () => {
    const baseline = createBaselineResolver(fakeContext);
    // line height 1.2 * 20 = 24; content 20; half-leading 2; ascent 16 -> 18
    expect(baseline(text())).toBeCloseTo(100 + 18, 6);
  });

  it("scales with the font size", () => {
    const baseline = createBaselineResolver(fakeContext);
    expect(baseline(text({ fontSize: 40 }))).toBeCloseTo(100 + 36, 6);
  });

  it("has no baseline for shapes, empty text or missing sizes", () => {
    const baseline = createBaselineResolver(fakeContext);
    expect(baseline({ ...text(), type: "rectangle" } as DrawingElement)).toBeNull();
    expect(baseline(text({ text: "" }))).toBeNull();
    expect(baseline(text({ fontSize: undefined }))).toBeNull();
    expect(baseline(text({ points: [] }))).toBeNull();
  });

  it("makes its context only when first needed, once, and gives up quietly without one", () => {
    let made = 0;
    const lazy = createBaselineResolver(() => {
      made += 1;
      return fakeContext();
    });
    expect(made).toBe(0);
    lazy(text());
    lazy(text({ id: "u" }));
    expect(made).toBe(1);
    expect(createBaselineResolver(() => null)(text())).toBeNull();
  });
});

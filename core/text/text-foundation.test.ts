import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { measureShapeLabel, FONT_FAMILY as LABEL_FONT_FAMILY } from "@/core/shapes/base/shape-label-renderer";
import { FONT_FAMILY as TEXT_FONT_FAMILY, LINE_HEIGHT_RATIO } from "@/core/shapes/text/text-metrics";
import { getTextBounds } from "@/core/shapes/text/geometry";
import { resizeText } from "@/core/shapes/text/interaction";
import { TextShape } from "@/core/shapes/text/types";
import { LABEL_PADDING, layoutShapeLabel } from "@/core/text/label-layout";
import { createEstimateContext, estimateLabelBox, estimateTextWidth } from "@/core/text/estimate";

/** Deterministic stand-in for a canvas 2D context: width is linear in the font size, like real text. */
const fakeCtx = (emPerChar = 0.5) => {
  const ctx = {
    font: "",
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
      return { width: [...text].length * size * emPerChar };
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
};

const textShape = (over: Partial<TextShape> = {}): TextShape =>
  ({
    id: "t1",
    type: "text",
    points: [{ x: 100, y: 50 }],
    color: "#111",
    strokeWidth: 1,
    text: "Hello world",
    fontSize: 20,
    fontWeight: "400",
    fontStyle: "normal",
    ...over,
  }) as TextShape;

describe("one typography source", () => {
  it("shape labels and standalone text use the same font family", () => {
    expect(TEXT_FONT_FAMILY).toBe(LABEL_FONT_FAMILY);
  });

  it("standalone text uses the line height the editor and shape labels use", () => {
    expect(LINE_HEIGHT_RATIO).toBe(1.2);
    const bounds = getTextBounds(textShape(), { textMeasureContext: fakeCtx(), zoom: 1 });
    expect(bounds?.height).toBeCloseTo(20 * 1.2, 5);
  });
});

describe("shape label layout does not depend on zoom", () => {
  const label = "Authentication service gateway";
  const layoutAt = (zoom: number) => {
    const m = measureShapeLabel({
      ctx: fakeCtx(),
      label,
      maxWidth: 160 * zoom,
      maxHeight: 70 * zoom,
      zoom,
      preferredFontSize: 17,
      preferredFontWeight: "600",
    });
    return {
      lines: m?.lines.map((l) => l.map((s) => s.text).join("")),
      fontSize: (m?.finalFontSize ?? 0) / zoom,
    };
  };

  it.each([0.25, 0.5, 2, 3])("wraps and sizes the same at zoom %s as at 100%", (zoom) => {
    const base = layoutAt(1);
    const scaled = layoutAt(zoom);
    expect(scaled.lines).toEqual(base.lines);
    expect(scaled.fontSize).toBeCloseTo(base.fontSize, 1);
  });
});

describe("resizing standalone text keeps the opposite edge fixed", () => {
  it("west-handle resize anchors the right edge at the measured position", () => {
    const ctx = fakeCtx(0.5); // the size-only estimator assumes 0.62 em/char, so it disagrees
    const shape = textShape();
    const original = getTextBounds(shape, { textMeasureContext: ctx, zoom: 1 })!;
    const resized = resizeText(shape, "w", { x: original.minX - original.width, y: 60 }, original);

    const next = getTextBounds(resized, { textMeasureContext: ctx, zoom: 1 })!;
    expect(next.maxX).toBeCloseTo(original.maxX, 3);
  });

  it("north-handle resize anchors the bottom edge", () => {
    const ctx = fakeCtx(0.5);
    const shape = textShape();
    const original = getTextBounds(shape, { textMeasureContext: ctx, zoom: 1 })!;
    const resized = resizeText(shape, "n", { x: 100, y: original.minY - original.height }, original);

    const next = getTextBounds(resized, { textMeasureContext: ctx, zoom: 1 })!;
    expect(next.maxY).toBeCloseTo(original.maxY, 3);
  });
});

describe("canvas-free sizing (interface for layout)", () => {
  const input = { fontSize: 17, fontWeight: "600", maxLines: 2, minWidth: 168, maxWidth: 280, insetWidth: 66 };

  it("a box from estimateLabelBox holds the label under the real layout code", () => {
    for (const label of ["API", "Authentication service gateway", "Primary PostgreSQL database cluster (eu-west-1)"]) {
      const box = estimateLabelBox({ ...input, label });
      if (!box.fits) continue;
      const layout = layoutShapeLabel(createEstimateContext(), {
        label,
        boxWidth: box.width - input.insetWidth,
        boxHeight: box.height,
        fontSize: input.fontSize,
        fontWeight: input.fontWeight,
        maxLines: input.maxLines,
      });
      expect(layout?.fits, label).toBe(true);
      expect(layout?.fontSize, label).toBe(input.fontSize);
      expect(layout?.lines.length, label).toBe(box.lineCount);
    }
  });

  it("grows with the text and flags labels that cannot fit", () => {
    const short = estimateLabelBox({ ...input, label: "API" });
    const long = estimateLabelBox({ ...input, label: "Authentication service gateway" });
    expect(long.width).toBeGreaterThan(short.width);
    const huge = estimateLabelBox({ ...input, label: "word ".repeat(60), maxLines: 1 });
    expect(huge.fits).toBe(false);
    expect(huge.width).toBe(280);
  });

  it("estimates wide letters wider than narrow ones", () => {
    expect(estimateTextWidth("WWWW", 16)).toBeGreaterThan(estimateTextWidth("iiii", 16) * 2);
  });
});

describe("label layout details", () => {
  it("returns the width the text wraps to, for editors placed over the label", () => {
    const layout = layoutShapeLabel(fakeCtx(), { label: "Hello", boxWidth: 200, boxHeight: 80 });
    expect(layout?.wrapWidth).toBe(200 - 2 * LABEL_PADDING);
  });

  it("a default (unset) weight does not change with zoom", () => {
    const at = (zoom: number) =>
      measureShapeLabel({ ctx: fakeCtx(), label: "Db", maxWidth: 120 * zoom, maxHeight: 60 * zoom, zoom, preferredFontSize: 17 })
        ?.fontWeight;
    expect(at(0.5)).toBe(at(1));
    expect(at(3)).toBe(at(1));
  });

  it("returns null instead of throwing for empty labels and degenerate boxes", () => {
    expect(layoutShapeLabel(fakeCtx(), { label: "  ", boxWidth: 200, boxHeight: 80 })).toBeNull();
    expect(layoutShapeLabel(fakeCtx(), { label: "x", boxWidth: 10, boxHeight: 80 })).toBeNull();
  });

  it("legacy elements with only text/fontSize still measure", () => {
    const legacy = { id: "old", type: "text", points: [{ x: 0, y: 0 }], color: "#000", strokeWidth: 1, text: "a\nb", fontSize: 18 } as unknown as TextShape;
    const b = getTextBounds(legacy, { textMeasureContext: fakeCtx(), zoom: 1 });
    expect(b?.height).toBeCloseTo(2 * 18 * 1.2, 5);
  });
});

describe("regressions found by the browser tests", () => {
  it("wrapped lines drop the space they broke at, so centring is not shifted", () => {
    const layout = layoutShapeLabel(fakeCtx(), { label: "Authentication service gateway", boxWidth: 160, boxHeight: 120, fontSize: 16 });
    for (const line of layout?.lines ?? []) {
      expect(line.map((span) => span.text).join("")).not.toMatch(/\s$/);
    }
    expect(layout?.lines.length).toBeGreaterThan(1);
  });

  it("shrinking a label to fit never changes its default weight (the editor opens with the unshrunk one)", () => {
    const big = layoutShapeLabel(fakeCtx(), { label: "Hello", boxWidth: 400, boxHeight: 200, fontSize: 20 });
    const squeezed = layoutShapeLabel(fakeCtx(), { label: "Authentication service gateway cluster", boxWidth: 150, boxHeight: 70, fontSize: 20 });
    expect(squeezed!.fontSize).toBeLessThan(18);
    expect(squeezed!.fontWeight).toBe(big!.fontWeight);
    expect(squeezed!.fontWeight).toBe("600");
  });
});

describe("single source of truth (acceptance criterion 1)", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  const files = ["core", "features", "app", "lib", "components", "hooks"].flatMap((d) => sources(join(root, d)));

  it("the font stack is written in exactly one file", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("BlinkMacSystemFont"));
    expect(hits.map((f) => f.replace(root, ""))).toEqual(["core/text/typography.ts"]);
  });

  it("no text code derives its own line height from the font size", () => {
    const hits = files.filter((f) => /fontSize\s*\*\s*1\.2\b|size\s*\*\s*1\.2\b|LINE_HEIGHT_MULTIPLIER/.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => f.replace(root, ""))).toEqual([]);
  });
});

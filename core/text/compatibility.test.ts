import { describe, expect, it } from "vitest";
import { getShapeAnchors, getShapeBounds } from "@/core/shapes/shape-runtime";
import { containsPointInText } from "@/core/shapes/text/interaction";
import { parseSavedContent } from "@/features/whiteboard/hooks/data/saved-content";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { LAYOUT_FIXTURES } from "@/features/ai/server/layout/fixtures";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { firstBaselineOffset } from "./baseline";
import { getShapeLabelRegion } from "./label-region";

const fakeCtx = () =>
  ({
    font: "",
    textBaseline: "alphabetic",
    measureText(this: { font: string }, text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
      return { width: [...text].length * size * 0.5 } as TextMetrics;
    },
  }) as unknown as CanvasRenderingContext2D;

const legacyText = {
  id: "old-text",
  type: "text",
  points: [{ x: 120, y: 80 }],
  color: "#1f2937",
  strokeWidth: 1,
  text: "Saved before the line-height change\nsecond line",
  fontSize: 20,
  fontWeight: "400",
  fontStyle: "normal",
} as unknown as DrawingElement;

describe("taller standalone text (line height 1.0 -> 1.2): what it touches", () => {
  const bounds = () => getShapeBounds(legacyText, { textMeasureContext: fakeCtx(), zoom: 1 })!;

  it("keeps the stored top-left anchor; only the box grows downward", () => {
    const b = bounds();
    expect(b.minX).toBe(120);
    expect(b.minY).toBe(80);
    expect(b.height).toBeCloseTo(2 * 20 * 1.2, 5); // was 2 * 20 * 1.0
  });

  it("selection and hit-testing use the same box", () => {
    const b = bounds();
    expect(containsPointInText(legacyText as never, { x: 130, y: 80 + 2 * 20 * 1.1 }, b)).toBe(true);
    expect(containsPointInText(legacyText as never, { x: 130, y: 80 + 2 * 20 * 1.2 + 1 }, b)).toBe(false);
  });

  it("text offers no connector anchors, so no connection can move", () => {
    expect(getShapeAnchors(legacyText, bounds())).toEqual([]);
  });

  it("saved boards: the stored element is read back untouched and measures from the same anchor", () => {
    const snapshot = JSON.stringify({ elements: [legacyText], canvasSettings: { zoom: 1 } });
    const parsed = parseSavedContent(snapshot);
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.elements[0]).toEqual(legacyText); // no field added, removed or migrated
    const again = getShapeBounds(parsed.elements[0] as DrawingElement, { textMeasureContext: fakeCtx(), zoom: 1 })!;
    expect(again).toEqual(bounds());
  });

  it("an AI diagram survives save and reload with identical text geometry", () => {
    const elements = compileAIDiagramToCanvas(LAYOUT_FIXTURES.flowchart, "frame-1");
    const reloaded = parseSavedContent(JSON.stringify({ elements }));
    expect(reloaded.status).toBe("ok");
    if (reloaded.status !== "ok") return;
    const measure = (els: DrawingElement[]) =>
      els.filter((e) => e.type === "text").map((e) => getShapeBounds(e, { textMeasureContext: fakeCtx(), zoom: 1 }));
    expect(measure(reloaded.elements as DrawingElement[])).toEqual(measure(elements));
    expect(reloaded.elements).toEqual(JSON.parse(JSON.stringify(elements)));
  });

  it("edge labels sit above their line, not on it, with the taller box", () => {
    const elements = compileAIDiagramToCanvas(LAYOUT_FIXTURES.architecture, "frame-1");
    const labels = elements.filter((e) => e.ai?.role === "edge-label");
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const b = getShapeBounds(label, { textMeasureContext: fakeCtx(), zoom: 1 })!;
      expect(b.height).toBeCloseTo(13 * 1.2, 5);
    }
  });
});

describe("semantic node label region", () => {
  const bounds = { minX: 100, minY: 50, maxX: 340, maxY: 128, width: 240, height: 78 };

  it("is the area right of the icon, not the whole node", () => {
    const r = getShapeLabelRegion("semantic-node", bounds);
    const left = r.centerX - r.width / 2;
    expect(left).toBeGreaterThan(bounds.minX + 28); // clear of the icon
    expect(r.centerX + r.width / 2).toBeLessThanOrEqual(bounds.maxX);
    expect(r.centerX).toBeGreaterThan(bounds.minX + bounds.width / 2); // centre sits right of the node's centre
    expect(r.centerY).toBe(bounds.minY + bounds.height / 2);
    expect(r.maxLines).toBe(4);
    expect(r.height).toBe(bounds.height); // the node's whole height; layout subtracts its own padding
  });

  it("other shapes use the whole box", () => {
    const r = getShapeLabelRegion("rectangle", bounds);
    expect(r).toMatchObject({ centerX: 220, centerY: 89, width: 240, height: 78 });
  });

  it("never collapses below a usable width on a tiny node", () => {
    const r = getShapeLabelRegion("semantic-node", { ...bounds, maxX: 130, width: 30 });
    expect(r.width).toBeGreaterThanOrEqual(32);
  });
});

describe("firstBaselineOffset", () => {
  it("puts the baseline half-leading plus ascent below the line top", () => {
    const ctx = fakeCtx();
    const metrics = ctx.measureText.bind(ctx);
    ctx.measureText = (t: string) => ({ ...metrics(t), fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 }) as TextMetrics;
    expect(firstBaselineOffset(ctx, 16, 19.2)).toBeCloseTo((19.2 - 20) / 2 + 16, 5);
    expect(ctx.textBaseline).toBe("alphabetic");
  });

  it("falls back to a 0.8em ascent when the browser reports no font box", () => {
    expect(firstBaselineOffset(fakeCtx(), 20, 24)).toBeCloseTo((24 - 20) / 2 + 16, 5);
  });
});

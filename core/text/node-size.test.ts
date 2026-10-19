import { describe, expect, it } from "vitest";
import { createEstimateContext, estimateTextWidth } from "./estimate";
import { layoutShapeLabel } from "./label-layout";
import { getShapeLabelRegion, pillLabelBox, pillSizeForLabel, SEMANTIC_INSET_WIDTH } from "./label-region";
import { sizePillNode, sizeSemanticNode } from "./node-size";

const input = { fontSize: 17, fontWeight: "600", minWidth: 168, maxWidth: 280, minHeight: 78 };
const LABELS = [
  "API",
  "Database",
  "Authentication service gateway",
  "Primary PostgreSQL database cluster (eu-west-1)",
  "Lock account for 15 minutes and notify the user by email",
  "Send one-time code\nby SMS or authenticator app",
  "Centralised Logging\nand Metrics",
];

describe("sizeSemanticNode", () => {
  it("keeps the familiar 168 x 78 box for short labels", () => {
    expect(sizeSemanticNode({ ...input, label: "API" })).toMatchObject({ width: 168, height: 78, lineCount: 1, fits: true });
  });

  it("grows the height, not just the width, for labels that need more lines", () => {
    const one = sizeSemanticNode({ ...input, label: "API" });
    const many = sizeSemanticNode({ ...input, label: "Lock account for 15 minutes and notify the user by email" });
    expect(many.lineCount).toBeGreaterThanOrEqual(3);
    expect(many.height).toBeGreaterThan(one.height);
    expect(many.width).toBeLessThanOrEqual(280);
  });

  it("honours explicit line breaks", () => {
    expect(sizeSemanticNode({ ...input, label: "one\ntwo\nthree" }).lineCount).toBe(3);
  });

  it("decision nodes keep their taller minimum", () => {
    expect(sizeSemanticNode({ ...input, label: "OK?", minHeight: 92 }).height).toBe(92);
  });

  it.each(LABELS)("the renderer lays %j out in exactly the lines it was sized for, at full size", (label) => {
    const size = sizeSemanticNode({ ...input, label });
    const bounds = { minX: 0, minY: 0, maxX: size.width, maxY: size.height, width: size.width, height: size.height };
    const region = getShapeLabelRegion("semantic-node", bounds);
    const layout = layoutShapeLabel(createEstimateContext(), {
      label, boxWidth: region.width, boxHeight: region.height, fontSize: 17, fontWeight: "600", maxLines: region.maxLines,
    })!;
    expect(layout.fits).toBe(true);
    expect(layout.fontSize).toBe(17);
    expect(layout.lines).toHaveLength(size.lineCount);
  });

  it("reports a label that cannot fit even at the widest box with the maximum lines", () => {
    const size = sizeSemanticNode({ ...input, label: "word ".repeat(80) });
    expect(size.fits).toBe(false);
    expect(size.width).toBe(280);
  });
});

describe("a word is never split to make a label fit", () => {
  // Reported from the app: "Authentication Service" drew as "Authenticati" / "on Service" because the
  // box was sized for two lines of the split word.
  it("sizes the box to at least the longest word", () => {
    const size = sizeSemanticNode({ ...input, label: "Authentication Service" });
    const word = estimateTextWidth("Authentication", 17, "600");
    expect(size.width).toBeGreaterThanOrEqual(word + SEMANTIC_INSET_WIDTH + 24);
  });

  it.each(["Authentication Service", "Internationalization", "Pneumonoultramicroscopic issues"])(
    "lays %j out with every word whole",
    (label) => {
      const size = sizeSemanticNode({ ...input, label });
      const region = getShapeLabelRegion("semantic-node", { minX: 0, minY: 0, maxX: size.width, maxY: size.height, width: size.width, height: size.height });
      const layout = layoutShapeLabel(createEstimateContext(), { label, boxWidth: region.width, boxHeight: region.height, fontSize: 17, fontWeight: "600", maxLines: region.maxLines })!;
      expect(layout.brokenWord).toBe(false);
      const wholeWords = label.split(/\s+/).every((w) => layout.lines.some((line) => line.map((s) => s.text).join("").includes(w)));
      expect(wholeWords).toBe(true);
    },
  );

  it("the renderer shrinks the text before it would split a word in a box that is too narrow", () => {
    const layout = layoutShapeLabel(createEstimateContext(), { label: "Authentication Service", boxWidth: 120, boxHeight: 120, fontSize: 17, fontWeight: "600" })!;
    expect(layout.brokenWord).toBe(false);
    expect(layout.fontSize).toBeLessThan(17);
  });

  it("reports a broken word only when even the smallest size cannot hold the word", () => {
    const layout = layoutShapeLabel(createEstimateContext(), { label: "Pneumonoultramicroscopicsilicovolcanoconiosis", boxWidth: 90, boxHeight: 120, fontSize: 17, fontWeight: "600" })!;
    expect(layout.brokenWord).toBe(true);
    expect(layout.fontSize).toBe(9);
  });

  it("a box that cannot hold the longest word at any width is reported as not fitting", () => {
    expect(sizeSemanticNode({ ...input, label: "Pneumonoultramicroscopicsilicovolcanoconiosis" }).fits).toBe(false);
  });
});

describe("sizePillNode", () => {
  const input = (label: string) => ({ label, fontSize: 17, fontWeight: "600", minWidth: 168, maxWidth: 280, minHeight: 64 });

  it.each(["Start", "End", "Order shipped", "Customer submits the request and waits for confirmation by email"])(
    "%s: the label lays out in the pill's label box at the requested size, with no broken word",
    (label) => {
      const size = sizePillNode(input(label));
      const box = pillLabelBox(size.width, size.height);
      const layout = layoutShapeLabel(createEstimateContext(), { label, boxWidth: box.width, boxHeight: box.height, fontSize: 17, fontWeight: "600", maxLines: box.maxLines });
      expect(layout?.fits, JSON.stringify(size)).toBe(true);
      expect(layout?.brokenWord).toBeFalsy();
      expect(layout!.fontSize).toBe(17);
    },
  );

  it("a single word wider than the widest pill is reported as not fitting, and the renderer shrinks it instead of breaking it", () => {
    const label = "Supercalifragilisticexpialidocious";
    const size = sizePillNode(input(label));
    expect(size.fits).toBe(false);
    // The label box gets the full 280; the pill adds the room its rounded ends take.
    expect(pillLabelBox(size.width, size.height).width).toBeGreaterThanOrEqual(280);
    const box = pillLabelBox(size.width, size.height);
    const layout = layoutShapeLabel(createEstimateContext(), { label, boxWidth: box.width, boxHeight: box.height, fontSize: 17, fontWeight: "600", maxLines: box.maxLines });
    expect(layout?.fits).toBe(true);
    expect(layout?.brokenWord).toBeFalsy();
    expect(layout!.fontSize).toBeLessThan(17);
  });

  it("keeps the minimum size for short labels and is never wider than a semantic node would allow", () => {
    expect(sizePillNode(input("Start"))).toMatchObject({ width: 168, height: 64 });
    expect(sizePillNode(input("x ".repeat(40))).width).toBeLessThanOrEqual(320);
  });

  it("pillSizeForLabel is the inverse of pillLabelBox", () => {
    const { width, height } = pillSizeForLabel({ width: 120, height: 40 }, { width: 0, height: 0 });
    const box = pillLabelBox(width, height);
    expect(box.width).toBeGreaterThanOrEqual(120);
    expect(box.height).toBeGreaterThanOrEqual(40);
  });
});

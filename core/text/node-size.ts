import { estimateLabelBox } from "./estimate";
import { LABEL_PADDING } from "./label-layout";
import { DIAMOND_LABEL_FRACTION, PILL_MAX_LINES, pillSizeForLabel, SEMANTIC_INSET_WIDTH, SEMANTIC_MAX_LINES } from "./label-region";
import { LINE_HEIGHT_RATIO } from "./typography";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";
import { ICON_CAPTION_HEIGHT, ICON_NODE_GLYPH } from "@/core/shapes/icon/caption";

export interface NodeSize {
  width: number;
  height: number;
  /** Lines the label needs at the requested font size. */
  lineCount: number;
  /** False when even the widest allowed box needs more than the line cap; the renderer will shrink the text. */
  fits: boolean;
}

export interface NodeSizeInput {
  label: string;
  fontSize: number;
  fontWeight?: string | number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
}

/**
 * Size of a semantic node that shows `label` at `fontSize`: the fewest lines that fit within the
 * width limits, the narrowest width for that many lines, and a height that holds those lines plus
 * the label padding. This is the inverse of `getShapeLabelRegion` + `layoutShapeLabel`, so the
 * renderer lays the label out in exactly the lines counted here.
 */
export const sizeSemanticNode = (input: NodeSizeInput): NodeSize => {
  const lineHeight = input.fontSize * LINE_HEIGHT_RATIO;
  const heightFor = (lines: number) => Math.max(input.minHeight, Math.ceil(lines * lineHeight + LABEL_PADDING * 2));
  for (let lines = 1; lines <= SEMANTIC_MAX_LINES; lines += 1) {
    const box = estimateLabelBox({
      label: input.label,
      fontSize: input.fontSize,
      fontWeight: input.fontWeight,
      maxLines: lines,
      minWidth: input.minWidth,
      maxWidth: input.maxWidth,
      insetWidth: SEMANTIC_INSET_WIDTH,
    });
    if (box.fits) return { width: box.width, height: heightFor(box.lineCount), lineCount: box.lineCount, fits: true };
  }
  return { width: input.maxWidth, height: heightFor(SEMANTIC_MAX_LINES), lineCount: SEMANTIC_MAX_LINES, fits: false };
};

/** Size of an icon node: the glyph with its caption underneath, as wide as the caption needs (two lines at most). */
export const sizeIconNode = (input: Pick<NodeSizeInput, "label" | "fontSize" | "fontWeight">): NodeSize => {
  const box = estimateLabelBox({ ...input, maxLines: 2, minWidth: 96, maxWidth: 200 });
  return { width: box.width, height: ICON_NODE_GLYPH + ICON_CAPTION_HEIGHT, lineCount: box.lineCount, fits: box.fits };
};

/** A text block of w x h fits a W x H rhombus when w/W + h/H <= 1; keep a little air. */
const DIAMOND_FIT = 0.95;
const DIAMOND_MAX_LINES = 3;

/** Size of a diamond that shows `label`: the text block must sit inside the rhombus, not just its bounding box. */
export const sizeDiamondNode = (input: NodeSizeInput): NodeSize => {
  const box = estimateLabelBox({
    label: input.label,
    fontSize: input.fontSize,
    fontWeight: input.fontWeight,
    maxLines: DIAMOND_MAX_LINES,
    minWidth: input.minWidth * DIAMOND_LABEL_FRACTION,
    maxWidth: input.maxWidth * DIAMOND_LABEL_FRACTION,
  });
  const height = Math.max(input.minHeight, Math.ceil(box.height * 2));
  const width = Math.max(input.minWidth, Math.ceil(box.width / (DIAMOND_FIT - box.height / height) / 4) * 4);
  return { width, height, lineCount: box.lineCount, fits: box.fits };
};

/** Size of a pill (flowchart start/end) that shows `label`: the fewest lines that fit its label box (see `pillLabelBox`). */
export const sizePillNode = (input: NodeSizeInput): NodeSize => {
  const min = { width: input.minWidth, height: input.minHeight };
  for (let lines = 1; lines <= PILL_MAX_LINES; lines += 1) {
    const box = estimateLabelBox({
      label: input.label,
      fontSize: input.fontSize,
      fontWeight: input.fontWeight,
      maxLines: lines,
      minWidth: 0,
      maxWidth: input.maxWidth,
    });
    if (box.fits) return { ...pillSizeForLabel(box, min), lineCount: box.lineCount, fits: true };
  }
  const widest = estimateLabelBox({ label: input.label, fontSize: input.fontSize, fontWeight: input.fontWeight, maxLines: PILL_MAX_LINES, minWidth: 0, maxWidth: input.maxWidth });
  return { ...pillSizeForLabel(widest, min), lineCount: PILL_MAX_LINES, fits: false };
};

const OUTLINE_MAX_LINES = 3;
const OUTLINE_FIT_ROUNDS = 8;

/**
 * Size of an outline node that shows `label`: its variant's text region (a function of the size, see
 * `outline/variants.ts`) must hold the label. Starts from the variant's default size and grows both sides
 * by the shortfall until the region fits, so it works for any variant without knowing its shape.
 */
export const sizeOutlineNode = (variantId: string, input: Pick<NodeSizeInput, "label" | "fontSize" | "fontWeight" | "maxWidth">): NodeSize => {
  const variant = resolveOutlineVariant(variantId);
  let width = variant.defaultSize.width;
  let height = variant.defaultSize.height;
  let lineCount = 1;
  for (let round = 0; round < OUTLINE_FIT_ROUNDS; round += 1) {
    const region = variant.textRegion(width, height);
    const need = estimateLabelBox({ label: input.label, fontSize: input.fontSize, fontWeight: input.fontWeight, maxLines: OUTLINE_MAX_LINES, minWidth: 0, maxWidth: Math.max(input.maxWidth, region.width) });
    lineCount = need.lineCount;
    const growX = need.width / region.width;
    const growY = need.height / region.height;
    if (growX <= 1 && growY <= 1) return { width: Math.ceil(width), height: Math.ceil(height), lineCount, fits: need.fits };
    width = Math.min(input.maxWidth * 1.6, width * Math.max(growX, 1));
    height *= Math.max(growY, 1);
  }
  return { width: Math.ceil(width), height: Math.ceil(height), lineCount, fits: false };
};

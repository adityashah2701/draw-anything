import { estimateLabelBox } from "./estimate";
import { LABEL_PADDING } from "./label-layout";
import { SEMANTIC_INSET_WIDTH, SEMANTIC_MAX_LINES } from "./label-region";
import { LINE_HEIGHT_RATIO } from "./typography";

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

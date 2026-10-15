import {
  layoutRichTextLines,
  measureRichTextLineWidth,
  RichTextSpan,
} from "@/features/whiteboard/utils/rich-text-renderer";
import type { MeasureContext } from "./measure-context";
import { LINE_HEIGHT_RATIO, MIN_FONT_SIZE, makeFontString } from "./typography";

/** All lengths are world units: the same label wraps identically at every zoom. */
export const LABEL_PADDING = 12;
export const MAX_FONT_SIZE = 72;
export const MAX_LABEL_LINES = 4;
export const DEFAULT_LABEL_FONT_SIZE = 16;

export interface ShapeLabelLayoutInput {
  label: string;
  boxWidth: number;
  boxHeight: number;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  maxLines?: number;
}

export interface ShapeLabelLayout {
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  lineHeight: number;
  lines: RichTextSpan[][];
  /** Width the lines were wrapped to (box minus padding). */
  wrapWidth: number;
  /** Widest line actually used. */
  width: number;
  height: number;
  /** False when even the smallest font had to drop text. */
  fits: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** A wrapped line keeps the space it broke at; browsers let it hang, so it must not shift centering. */
const trimLineEnd = (line: RichTextSpan[]) => {
  const out = line.map((span) => ({ ...span }));
  while (out.length > 0) {
    const last = out[out.length - 1];
    const text = last.text.replace(/\s+$/u, "");
    if (text) {
      last.text = text;
      break;
    }
    out.pop();
  }
  return out;
};

/** Labels default to a heavier weight as they grow, unless the element says otherwise. */
export const defaultLabelWeight = (fontSize: number) => (fontSize >= 18 ? "600" : "500");

export const layoutShapeLabel = (
  ctx: MeasureContext,
  input: ShapeLabelLayoutInput,
): ShapeLabelLayout | null => {
  const label = input.label.trim();
  if (!label) return null;

  const wrapWidth = input.boxWidth - LABEL_PADDING * 2;
  const availableHeight = input.boxHeight - LABEL_PADDING * 2;
  if (wrapWidth <= 8 || availableHeight <= 8) return null;

  const fontStyle = input.fontStyle || "normal";
  const maxLines = clamp(input.maxLines ?? MAX_LABEL_LINES, 1, MAX_LABEL_LINES);
  const target = Math.floor(
    clamp(input.fontSize ?? DEFAULT_LABEL_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE),
  );

  // Resolved from the requested size, not the fitted one, so shrinking never changes the weight
  // (the editor opens with this same weight).
  const fontWeight = String(input.fontWeight || defaultLabelWeight(target));

  const layoutAt = (size: number, lines: number) => {
    ctx.font = makeFontString(size, fontWeight, fontStyle);
    return {
      ...layoutRichTextLines(ctx, label, {
        baseFontSize: size,
        baseFontWeight: fontWeight,
        baseFontStyle: fontStyle,
        maxWidth: wrapWidth,
        maxLines: lines,
      }),
    };
  };

  let fontSize = MIN_FONT_SIZE;
  let chosen = null as ReturnType<typeof layoutAt> | null;
  let fits = false;
  for (let size = target; size >= MIN_FONT_SIZE; size -= 1) {
    const attempt = layoutAt(size, maxLines);
    if (attempt.lines.length === 0 || attempt.truncated) continue;
    if (attempt.lines.length * size * LINE_HEIGHT_RATIO > availableHeight) continue;
    fontSize = size;
    chosen = attempt;
    fits = true;
    break;
  }

  if (!chosen) {
    const lineBudget = clamp(Math.floor(availableHeight / (fontSize * LINE_HEIGHT_RATIO)), 1, maxLines);
    chosen = layoutAt(fontSize, lineBudget);
  }
  if (chosen.lines.length === 0) return null;
  const lines = chosen.lines.map(trimLineEnd);

  let width = 0;
  for (const line of lines) {
    width = Math.max(
      width,
      measureRichTextLineWidth(ctx, line, fontSize, fontWeight, fontStyle),
    );
  }
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;

  return {
    fontSize,
    fontWeight,
    fontStyle,
    lineHeight,
    lines,
    wrapWidth,
    width,
    height: lines.length * lineHeight,
    fits,
  };
};

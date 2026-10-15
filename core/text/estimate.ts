import { layoutRichTextLines } from "@/features/whiteboard/utils/rich-text-renderer";
import { INTER_ADVANCES } from "./inter-advances";
import { LABEL_PADDING } from "./label-layout";
import type { MeasureContext } from "./measure-context";
import { LINE_HEIGHT_RATIO } from "./typography";

/*
 * Canvas-free text sizing for code that has no DOM (the AI compiler, tests).
 * Advance widths are Inter's, measured from the font file (inter-advances.ts), without kerning.
 * Measured against Chrome's real widths over tests/browser/calibration-corpus.ts, error is within
 * about +-2% for Inter and runs wider (safe side) for Helvetica/Arial; the app does not load Inter
 * itself, so users on other system fonts can differ by a few percent either way.
 * shortcut: no kerning and no non-Latin tables (CJK is 1em, other scripts a flat average); replace
 * with measured sizes if layout needs exact boxes.
 */

const WEIGHTS = [400, 500, 600, 700];
const BOX_MARGIN = 1.04;
const FALLBACK_EM = 0.56; // lowercase average, for scripts we have no table for

const nearestWeight = (fontWeight: string | number) => {
  const raw = Number.parseInt(String(fontWeight), 10) || (fontWeight === "bold" ? 700 : 400);
  return WEIGHTS.reduce((best, w) => (Math.abs(w - raw) < Math.abs(best - raw) ? w : best));
};

const advanceEm = (char: string, table: number[]) => {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return 1; // CJK and full-width forms
  if (code >= 32 && code <= 126) return table[code - 32] / 1000;
  if (code >= 0xc0 && code <= 0x24f) {
    const base = char.normalize("NFD")[0].codePointAt(0) ?? 0; // accented letter ~ its base letter
    if (base >= 32 && base <= 126) return table[base - 32] / 1000;
  }
  return FALLBACK_EM;
};

export const estimateTextWidth = (
  text: string,
  fontSize: number,
  fontWeight: string | number = "400",
) => {
  const table = INTER_ADVANCES[nearestWeight(fontWeight)];
  let em = 0;
  for (const char of text) em += advanceEm(char, table);
  return em * fontSize;
};

/** A MeasureContext backed by the estimator, so the real wrapping code runs without a canvas. */
export const createEstimateContext = (): MeasureContext => {
  const ctx = {
    font: "",
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
      const weight = /\b([1-9]00)\b/.exec(this.font)?.[1] ?? (/\bbold\b/.test(this.font) ? "700" : "400");
      return { width: estimateTextWidth(text, size, weight) } as TextMetrics;
    },
  };
  return ctx;
};

export interface LabelBoxInput {
  label: string;
  fontSize: number;
  fontWeight?: string | number;
  fontStyle?: string;
  maxLines: number;
  minWidth: number;
  maxWidth: number;
  /** Width of node chrome next to the label region, e.g. an icon. */
  insetWidth?: number;
}

export interface LabelBox {
  width: number;
  height: number;
  lineCount: number;
  /** False when the label needs more than `maxLines` even at `maxWidth`. */
  fits: boolean;
}

/** Smallest box, within the width limits, that holds the label at the requested font size. */
export const estimateLabelBox = (input: LabelBoxInput): LabelBox => {
  const ctx = createEstimateContext();
  const inset = input.insetWidth ?? 0;
  const label = input.label.trim();
  const lineHeight = input.fontSize * LINE_HEIGHT_RATIO;
  const heightFor = (lines: number) => lines * lineHeight + LABEL_PADDING * 2;

  // A word is never split to make a label fit, so the box is at least as wide as the longest word.
  const longest = Math.max(0, ...label.split(/\s+/u).map((w) => estimateTextWidth(w, input.fontSize, input.fontWeight ?? "400")));
  const widestWordBox = Math.ceil((longest * BOX_MARGIN + inset + LABEL_PADDING * 2) / 4) * 4;
  if (widestWordBox > input.maxWidth) {
    return { width: input.maxWidth, height: heightFor(input.maxLines), lineCount: input.maxLines, fits: false };
  }

  for (let width = Math.max(input.minWidth, widestWordBox); width <= input.maxWidth; width += 4) {
    ctx.font = "";
    const { lines, truncated } = layoutRichTextLines(ctx, label, {
      baseFontSize: input.fontSize,
      baseFontWeight: input.fontWeight ?? "400",
      baseFontStyle: input.fontStyle ?? "normal",
      // Text must fit in ~96% of the line: covers the worst measured undershoot of Inter (-0.85%), system San Francisco (-2.3%) and Geist (-3.6%).
      maxWidth: (width - inset - LABEL_PADDING * 2) / BOX_MARGIN,
      maxLines: input.maxLines,
    });
    if (!truncated) {
      return { width, height: heightFor(Math.max(1, lines.length)), lineCount: lines.length, fits: true };
    }
  }
  return { width: input.maxWidth, height: heightFor(input.maxLines), lineCount: input.maxLines, fits: false };
};

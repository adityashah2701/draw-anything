import type { CSSProperties } from "react";
import { FONT_FAMILY, LINE_HEIGHT_RATIO, makeFontString } from "@/core/text/typography";

/**
 * The DOM editor must sit exactly over the canvas-drawn label. Canvas places the
 * em-box top where CSS places the line box, so the first glyph differs by a
 * font-specific amount; it is measured here instead of guessed.
 */
const labelOffsetCache = new Map<string, number>();

export function measureLabelEditTopOffset(
  fontSize: number,
  fontWeight: string,
  fontStyle: string,
): number {
  const key = `lbl|${fontSize}|${fontWeight}|${fontStyle}`;
  const cached = labelOffsetCache.get(key);
  if (cached !== undefined) return cached;

  if (typeof document === "undefined") {
    return fontSize * 0.1;
  }

  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const fontStr = makeFontString(fontSize, fontWeight, fontStyle);

  // Distance from the canvas 'top' line (where renderShapeLabel aligns text) to the alphabetic
  // baseline. Read from alphabeticBaseline: fontBoundingBoxAscent is an integer and measured from
  // a different line, which left the editor 2-3px low at 2x.
  let topToBaseline = fontSize * 0.8;
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx) {
    ctx.font = fontStr;
    ctx.textBaseline = "top";
    const metrics = ctx.measureText("Mg");
    if (Number.isFinite(metrics.alphabeticBaseline)) {
      topToBaseline = Math.abs(metrics.alphabeticBaseline);
    }
  }

  // CSS baseline Y.
  const testDiv = document.createElement("div");
  testDiv.style.cssText = `
    position: absolute;
    left: -9999px;
    top: -9999px;
    visibility: hidden;
    pointer-events: none;
    font-family: ${FONT_FAMILY};
    font-size: ${fontSize}px;
    font-weight: ${fontWeight};
    font-style: ${fontStyle};
    line-height: ${lineHeight}px;
    white-space: pre;
    padding: 0;
    margin: 0;
    border: 0;
  `;
  testDiv.innerHTML = `<span>Mg</span><span id="baseline-marker" style="display: inline-block; width: 0; height: 0;"></span>`;
  document.body.appendChild(testDiv);
  // getBoundingClientRect, not offsetTop: offsetTop rounds to whole pixels, which is a visible
  // error once the editor is zoomed.
  const marker = testDiv.querySelector("#baseline-marker") as HTMLSpanElement;
  const cssBaselineY = marker.getBoundingClientRect().top - testDiv.getBoundingClientRect().top;
  document.body.removeChild(testDiv);

  // The canvas label starts half-leading below its 'top' line; the DOM line box already includes it.
  const offset = cssBaselineY - (lineHeight - fontSize) / 2 - topToBaseline;
  labelOffsetCache.set(key, offset);
  return offset;
}

export interface ShapeLabelEditorStyleInput {
  /** Screen-space center of the label region. */
  sx: number;
  sy: number;
  editTopOffset: number;
  editorWidth: number;
  editorFontSize: number;
  editorLineHeight: number;
  editorMinHeight: number;
  fontWeight: string;
  fontStyle: string;
  color: string;
  /** Degrees the shape (and so its label) is rotated by; the editor turns with it. */
  rotation?: number;
}

/** Centered on (sx, sy) with translate(-50%, -50%); top is shifted by the measured baseline offset. */
export const shapeLabelEditorStyle = (i: ShapeLabelEditorStyleInput): CSSProperties => {
  const turn = ((i.rotation ?? 0) * Math.PI) / 180;
  return {
    position: "absolute",
    // The baseline offset points up in the label's own frame, so it turns with the label.
    left: i.sx + i.editTopOffset * Math.sin(turn),
    top: i.sy - i.editTopOffset * Math.cos(turn),
    transform: i.rotation ? `translate(-50%, -50%) rotate(${i.rotation}deg)` : "translate(-50%, -50%)",
    width: i.editorWidth,
    zIndex: 110,
    textAlign: "center",
    fontSize: i.editorFontSize,
    fontWeight: i.fontWeight,
    fontStyle: i.fontStyle as "normal" | "italic",
    lineHeight: `${i.editorLineHeight}px`,
    letterSpacing: 0,
    padding: 0,
    minHeight: `${i.editorMinHeight}px`,
    margin: 0,
    direction: "ltr",
    unicodeBidi: "plaintext",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: FONT_FAMILY,
    color: i.color,
    caretColor: i.color,
  };
};

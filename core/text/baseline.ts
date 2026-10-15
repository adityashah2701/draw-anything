/**
 * Where CSS puts the first baseline inside a line box of `lineHeightPx`: half-leading above the
 * font's ascent. Drawing canvas text with textBaseline "alphabetic" at `top + this` lands it on
 * the same pixels as the DOM editor. (textBaseline "top" does not: it is the em-square top, which
 * sits about 0.1em above the ascent line for most fonts.)
 */
export const firstBaselineOffset = (
  ctx: Pick<CanvasRenderingContext2D, "font" | "measureText" | "textBaseline">,
  fontSizePx: number,
  lineHeightPx: number,
) => {
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText("Mg");
  const ascent = m.fontBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = m.fontBoundingBoxDescent ?? fontSizePx * 0.2;
  return (lineHeightPx - (ascent + descent)) / 2 + ascent;
};

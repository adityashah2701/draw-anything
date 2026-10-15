/** The only definition of how text is set: canvas drawing, measuring and the DOM editors all read it. */
export const FONT_FAMILY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Canvas and editor must agree, or entering edit mode shifts glyphs. */
export const LINE_HEIGHT_RATIO = 1.2;

export const MIN_FONT_SIZE = 9;

export const makeFontString = (
  fontSize: number,
  fontWeight: string | number,
  fontStyle: string,
) => `${fontStyle === "italic" ? "italic" : "normal"} ${fontWeight} ${fontSize}px ${FONT_FAMILY}`;

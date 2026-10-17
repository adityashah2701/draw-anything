/** Glyph size (world units) of an icon node in an AI diagram. */
export const ICON_NODE_GLYPH = 64;

/** Height (world units) reserved under the glyph of an icon that carries a label, which AI diagrams use to name it. */
export const ICON_CAPTION_HEIGHT = 36;

/** Where the glyph and the optional caption go inside an icon's box (world units, relative to its top-left). */
export const splitIconBox = (width: number, height: number, hasCaption: boolean) => {
  const caption = hasCaption ? Math.min(ICON_CAPTION_HEIGHT, height / 2) : 0;
  const glyphHeight = height - caption;
  return {
    glyph: { centerX: width / 2, centerY: glyphHeight / 2, size: Math.min(width, glyphHeight) },
    caption: hasCaption ? { centerX: width / 2, centerY: glyphHeight + caption / 2, width, height: caption } : null,
  };
};

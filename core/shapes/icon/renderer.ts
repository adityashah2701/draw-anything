import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { drawIconGlyph } from "@/core/icons/draw";
import { iconForNode } from "@/core/icons/registry";
import { IconShape } from "@/core/shapes/icon/types";
import { splitIconBox } from "@/core/shapes/icon/caption";
import { isDarkRender } from "@/core/theme/render-theme";
import { readableOnDark } from "@/core/color/adaptive-color";
import { LABEL_PADDING } from "@/core/text/label-layout";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";

/** The glyph with no tile, plus a caption under it only when the element has a `label` (AI diagrams). Line icons take the element's colour; brand marks keep theirs. */
export const renderIconToCanvas = (shape: IconShape, context: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const [a, b] = shape.points;
  const left = Math.min(a.x, b.x) * zoom + panOffset.x;
  const top = Math.min(a.y, b.y) * zoom + panOffset.y;
  const width = Math.abs(b.x - a.x) * zoom;
  const height = Math.abs(b.y - a.y) * zoom;
  const def = iconForNode(shape.ai);
  // No box behind a bare icon, so on the dark canvas its colour has to be light enough to read.
  const color = isDarkRender() ? readableOnDark(shape.color) : shape.color;
  const { glyph: g, caption: c } = splitIconBox(width / zoom, height / zoom, Boolean(shape.label));
  const glyph = { centerX: g.centerX * zoom, centerY: g.centerY * zoom, size: g.size * zoom };
  const caption = c && { centerX: c.centerX * zoom, centerY: c.centerY * zoom, width: c.width * zoom, height: c.height * zoom };
  // Glyph units scale with the box, so the stroke slider thins or thickens the line relative to the glyph.
  drawIconGlyph(ctx, def, left + glyph.centerX, top + glyph.centerY, glyph.size, color, shape.strokeWidth);
  if (!caption || !shape.label) return;
  const cx = left + caption.centerX;
  const cy = top + caption.centerY;
  renderShapeLabel({
    ctx,
    label: shape.label,
    centerX: cx,
    centerY: cy,
    maxWidth: caption.width,
    // The label layout takes off its own padding: give it that on top so a two-line caption keeps its font size.
    maxHeight: caption.height + LABEL_PADDING * 2 * zoom,
    zoom,
    clipPath: (canvasContext) => {
      canvasContext.beginPath();
      canvasContext.rect(cx - caption.width / 2, cy - caption.height / 2, caption.width, caption.height);
    },
    preferredColor: color,
    preferredFontSize: shape.fontSize,
    preferredFontWeight: shape.fontWeight,
    preferredFontStyle: shape.fontStyle,
    maxLines: 2,
  });
};

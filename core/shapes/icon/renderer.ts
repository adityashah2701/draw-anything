import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { drawIconGlyph } from "@/core/icons/draw";
import { iconForNode } from "@/core/icons/registry";
import { IconShape } from "@/core/shapes/icon/types";

/** The glyph, nothing else: no tile, no label. Line icons take the element's colour; brand marks keep theirs. */
export const renderIconToCanvas = (shape: IconShape, context: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const [a, b] = shape.points;
  const left = Math.min(a.x, b.x) * zoom + panOffset.x;
  const top = Math.min(a.y, b.y) * zoom + panOffset.y;
  const width = Math.abs(b.x - a.x) * zoom;
  const height = Math.abs(b.y - a.y) * zoom;
  const def = iconForNode(shape.ai);
  // Glyph units scale with the box, so the stroke slider thins or thickens the line relative to the glyph.
  drawIconGlyph(ctx, def, left + width / 2, top + height / 2, Math.min(width, height), shape.color, shape.strokeWidth);
};

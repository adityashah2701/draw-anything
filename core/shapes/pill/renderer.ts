import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { PillShape } from "@/core/shapes/pill/types";
import { pillLabelBox } from "@/core/text/label-region";

export const renderPillToCanvas = (shape: PillShape, context: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const [a, b] = shape.points;
  const left = Math.min(a.x, b.x) * zoom + panOffset.x;
  const top = Math.min(a.y, b.y) * zoom + panOffset.y;
  const width = Math.abs(b.x - a.x) * zoom;
  const height = Math.abs(b.y - a.y) * zoom;
  const outline = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.roundRect(left, top, width, height, Math.min(width, height) / 2);
  };

  outline(ctx);
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();

  if (shape.label) {
    const box = pillLabelBox(width, height);
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX: left + width / 2,
      centerY: top + height / 2,
      maxWidth: box.width,
      maxHeight: box.height,
      zoom,
      clipPath: outline,
      preferredColor: shape.color,
      fillColor: shape.fill,
      preferredFontSize: shape.fontSize,
      preferredFontWeight: shape.fontWeight,
      preferredFontStyle: shape.fontStyle,
      maxLines: box.maxLines,
    });
  }
};

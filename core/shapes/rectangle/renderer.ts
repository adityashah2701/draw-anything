import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { RectangleShape } from "@/core/shapes/rectangle/types";

export const renderRectangleToCanvas = (
  shape: RectangleShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const startX = shape.points[0].x * zoom + panOffset.x;
  const startY = shape.points[0].y * zoom + panOffset.y;
  const endX = shape.points[1].x * zoom + panOffset.x;
  const endY = shape.points[1].y * zoom + panOffset.y;
  const width = endX - startX;
  const height = endY - startY;

  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fillRect(startX, startY, width, height);
  }
  ctx.strokeRect(startX, startY, width, height);

  if (shape.label) {
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX: startX + width / 2,
      centerY: startY + height / 2,
      maxWidth: Math.abs(width),
      maxHeight: Math.abs(height),
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        canvasContext.rect(startX, startY, width, height);
        canvasContext.closePath();
      },
      preferredColor: shape.color,
      fillColor: shape.fill,
      preferredFontSize: shape.fontSize,
      preferredFontWeight: shape.fontWeight,
      preferredFontStyle: shape.fontStyle,
    });
  }
};

import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { CORNER_RADIUS, screenCornerRadius } from "@/core/shapes/base/geometry-tokens";
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

  ctx.beginPath();
  ctx.roundRect(
    Math.min(startX, endX),
    Math.min(startY, endY),
    Math.abs(width),
    Math.abs(height),
    screenCornerRadius(CORNER_RADIUS.rectangle, zoom, width, height),
  );
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();

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

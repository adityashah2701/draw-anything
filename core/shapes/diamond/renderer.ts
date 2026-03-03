import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { DiamondShape } from "@/core/shapes/diamond/types";

export const renderDiamondToCanvas = (
  shape: DiamondShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const startX = shape.points[0].x * zoom + panOffset.x;
  const startY = shape.points[0].y * zoom + panOffset.y;
  const endX = shape.points[1].x * zoom + panOffset.x;
  const endY = shape.points[1].y * zoom + panOffset.y;
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(right, cy);
  ctx.lineTo(cx, bottom);
  ctx.lineTo(left, cy);
  ctx.closePath();
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();

  if (shape.label) {
    const width = right - left;
    const height = bottom - top;
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX: cx,
      centerY: cy,
      maxWidth: width * 0.66,
      maxHeight: height * 0.66,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        canvasContext.moveTo(cx, top);
        canvasContext.lineTo(right, cy);
        canvasContext.lineTo(cx, bottom);
        canvasContext.lineTo(left, cy);
        canvasContext.closePath();
      },
      preferredColor: shape.color,
      fillColor: shape.fill,
      preferredFontSize: shape.fontSize,
      preferredFontWeight: shape.fontWeight,
      preferredFontStyle: shape.fontStyle,
      maxLines: 3,
    });
  }
};

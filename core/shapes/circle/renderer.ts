import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { CircleShape } from "@/core/shapes/circle/types";
import { getCircleRadius } from "@/core/shapes/circle/geometry";

export const renderCircleToCanvas = (
  shape: CircleShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const center = shape.points[0];
  const centerX = center.x * zoom + panOffset.x;
  const centerY = center.y * zoom + panOffset.y;
  const radius = getCircleRadius(shape) * zoom;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();

  if (shape.label) {
    const diameter = radius * 2;
    const labelBox = diameter * 0.72;
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX,
      centerY,
      maxWidth: labelBox,
      maxHeight: labelBox,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        canvasContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
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

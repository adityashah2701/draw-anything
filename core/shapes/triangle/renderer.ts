import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { TriangleShape } from "@/core/shapes/triangle/types";
import { getTriangleBounds } from "@/core/shapes/triangle/geometry";

export const renderTriangleToCanvas = (
  shape: TriangleShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const bounds = getTriangleBounds(shape);
  if (!bounds) return;

  const { ctx, zoom, panOffset } = context;

  // Calculate coordinates in canvas space
  const tx = (bounds.minX + bounds.width / 2) * zoom + panOffset.x;
  const ty = bounds.minY * zoom + panOffset.y;
  const brx = bounds.maxX * zoom + panOffset.x;
  const bry = bounds.maxY * zoom + panOffset.y;
  const blx = bounds.minX * zoom + panOffset.x;
  const bly = bounds.maxY * zoom + panOffset.y;

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(brx, bry);
  ctx.lineTo(blx, bly);
  ctx.closePath();

  // Inherit stroke properties from the context (set by drawElement)

  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();

  if (shape.label) {
    // Center of bounds in canvas space
    const cx = (bounds.minX + bounds.width / 2) * zoom + panOffset.x;
    const cy = (bounds.minY + bounds.height * 0.6) * zoom + panOffset.y; // shift text slightly lower for triangle center of mass
    const labelBoxW = bounds.width * 0.5 * zoom;
    const labelBoxH = bounds.height * 0.4 * zoom;

    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX: cx,
      centerY: cy,
      maxWidth: labelBoxW,
      maxHeight: labelBoxH,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        canvasContext.moveTo(tx, ty);
        canvasContext.lineTo(brx, bry);
        canvasContext.lineTo(blx, bly);
        canvasContext.closePath();
      },
      preferredColor: shape.color,
      fillColor: shape.fill,
      preferredFontSize: shape.fontSize,
      preferredFontWeight: shape.fontWeight,
      preferredFontStyle: shape.fontStyle,
      maxLines: 2,
    });
  }
};

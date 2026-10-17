import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { EllipseShape } from "@/core/shapes/ellipse/types";
import { ELLIPSE_LABEL_FRACTION } from "@/core/text/label-region";

const KAPPA = 0.5522847498;

/** Four Bezier arcs, not ctx.ellipse: the SVG export recorder supports curves but not ellipse(). */
const traceEllipse = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  ctx.moveTo(cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy + ry * KAPPA, cx + rx * KAPPA, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rx * KAPPA, cy + ry, cx - rx, cy + ry * KAPPA, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - ry * KAPPA, cx - rx * KAPPA, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * KAPPA, cy - ry, cx + rx, cy - ry * KAPPA, cx + rx, cy);
  ctx.closePath();
};

export const renderEllipseToCanvas = (
  shape: EllipseShape,
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
  traceEllipse(ctx, cx, cy, (right - left) / 2, (bottom - top) / 2);
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
      maxWidth: width * ELLIPSE_LABEL_FRACTION,
      maxHeight: height * ELLIPSE_LABEL_FRACTION,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        traceEllipse(canvasContext, cx, cy, (right - left) / 2, (bottom - top) / 2);
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

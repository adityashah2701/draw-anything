import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
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
    ctx.save();
    ctx.fillStyle = shape.color || "#1f2937";
    ctx.font = `${Math.max(12, (shape.fontSize ?? 16) * zoom)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.label, cx, cy);
    ctx.restore();
  }
};


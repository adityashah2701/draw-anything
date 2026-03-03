import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
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
    ctx.save();
    ctx.fillStyle = shape.color || "#1f2937";
    ctx.font = `${Math.max(12, (shape.fontSize ?? 16) * zoom)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.label, centerX, centerY);
    ctx.restore();
  }
};


import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
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
    ctx.save();
    ctx.fillStyle = shape.color || "#1f2937";
    ctx.font = `${Math.max(12, (shape.fontSize ?? 16) * zoom)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.label, startX + width / 2, startY + height / 2);
    ctx.restore();
  }
};


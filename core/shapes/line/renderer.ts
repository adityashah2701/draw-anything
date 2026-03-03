import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { LineShape } from "@/core/shapes/line/types";

export const renderLineToCanvas = (
  shape: LineShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const start = shape.points[0];
  const end = shape.points[shape.points.length - 1];
  ctx.beginPath();
  ctx.moveTo(start.x * zoom + panOffset.x, start.y * zoom + panOffset.y);
  ctx.lineTo(end.x * zoom + panOffset.x, end.y * zoom + panOffset.y);
  ctx.stroke();
};


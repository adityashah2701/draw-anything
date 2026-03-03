import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { FreehandShape } from "@/core/shapes/freehand/types";

export const renderFreehandToCanvas = (
  shape: FreehandShape,
  context: ShapeRenderCanvasContext,
) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  ctx.beginPath();
  ctx.moveTo(
    shape.points[0].x * zoom + panOffset.x,
    shape.points[0].y * zoom + panOffset.y,
  );
  for (let i = 1; i < shape.points.length; i += 1) {
    ctx.lineTo(
      shape.points[i].x * zoom + panOffset.x,
      shape.points[i].y * zoom + panOffset.y,
    );
  }
  ctx.stroke();
};


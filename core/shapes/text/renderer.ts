import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { TextShape } from "@/core/shapes/text/types";

export const renderTextToCanvas = (
  shape: TextShape,
  context: ShapeRenderCanvasContext,
) => {
  if (!shape.text || !shape.fontSize || shape.id === context.editingTextId) return;

  const { ctx, zoom, panOffset } = context;
  const weight =
    shape.fontWeight ||
    (shape.fontSize >= 36
      ? "800"
      : shape.fontSize >= 26
        ? "700"
        : shape.fontSize >= 20
          ? "600"
          : "400");
  const style = shape.fontStyle || "normal";
  const baseSize = shape.fontSize;
  let effectiveSize = baseSize;
  if (weight === "800") effectiveSize = Math.max(baseSize, 36);
  else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
  else if (weight === "600" && baseSize >= 20) {
    effectiveSize = Math.max(baseSize, 20);
  }

  ctx.textBaseline = "top";
  ctx.font = `${style} ${weight} ${effectiveSize * zoom}px Inter, sans-serif`;
  ctx.fillStyle = shape.color || "#000000";

  const startX = shape.points[0].x * zoom + panOffset.x;
  const startY = shape.points[0].y * zoom + panOffset.y;
  const lineHeight = effectiveSize * zoom * 1.2;
  shape.text.split("\n").forEach((line, index) => {
    ctx.fillText(line, startX, startY + index * lineHeight);
  });
};


import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { getAdaptiveColor } from "@/features/whiteboard/utils/canvas-render-utils";
import { renderRichTextLines } from "@/features/whiteboard/utils/rich-text-renderer";
import { TextShape } from "@/core/shapes/text/types";

import { resolveTextStyle } from "./text-metrics";

export const renderTextToCanvas = (
  shape: TextShape,
  context: ShapeRenderCanvasContext,
) => {
  if (!shape.text || !shape.fontSize || shape.id === context.editingTextId) return;

  const { ctx, zoom, panOffset } = context;
  const { fontSize: effectiveSize, fontWeight: weight, fontStyle: style, lineHeight, fontString } = resolveTextStyle(shape.fontSize, shape.fontWeight, shape.fontStyle);

  ctx.textBaseline = "top";
  ctx.font = `${style} ${weight} ${effectiveSize * zoom}px Inter, sans-serif`;
  
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const color = getAdaptiveColor(shape.color, isDark);
  ctx.fillStyle = color;

  const startX = shape.points[0].x * zoom + panOffset.x;
  const startY = shape.points[0].y * zoom + panOffset.y;
  
  // Align canvas top-baseline with CSS line-box centering
  const halfLeading = (lineHeight - effectiveSize) * zoom / 2;

  renderRichTextLines(
    ctx,
    shape.text,
    startX,
    startY + halfLeading,
    effectiveSize * zoom,
    weight,
    style,
    lineHeight * zoom,
    color,
    "left"
  );
};


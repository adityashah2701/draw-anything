import { isDarkRender } from "@/core/theme/render-theme";
import { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { getAdaptiveColor } from "@/core/color/adaptive-color";
import { renderRichTextLines } from "@/features/whiteboard/utils/rich-text-renderer";
import { TextShape } from "@/core/shapes/text/types";

import { firstBaselineOffset } from "@/core/text/baseline";
import { makeFontString } from "@/core/text/typography";
import { resolveTextStyle } from "./text-metrics";

export const renderTextToCanvas = (
  shape: TextShape,
  context: ShapeRenderCanvasContext,
) => {
  if (!shape.text || !shape.fontSize || shape.id === context.editingTextId) return;

  const { ctx, zoom, panOffset } = context;
  const { fontSize: effectiveSize, fontWeight: weight, fontStyle: style, lineHeight } = resolveTextStyle(shape.fontSize, shape.fontWeight, shape.fontStyle);

  ctx.save();
  ctx.font = makeFontString(effectiveSize * zoom, weight, style);

  const isDark = isDarkRender();

  const color = getAdaptiveColor(shape.color, isDark);
  ctx.fillStyle = color;

  const startX = shape.points[0].x * zoom + panOffset.x;
  const startY = shape.points[0].y * zoom + panOffset.y;
  
  // First baseline exactly where the DOM editor's line box puts it (see core/text/baseline.ts).
  const baselineY =
    startY + firstBaselineOffset(ctx, effectiveSize * zoom, lineHeight * zoom);

  renderRichTextLines(
    ctx,
    shape.text,
    startX,
    baselineY,
    effectiveSize * zoom,
    weight,
    style,
    lineHeight * zoom,
    color,
    "left"
  );
  ctx.restore();
};


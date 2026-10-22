import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { tracePath } from "@/core/shapes/outline/path";
import type { OutlineShape } from "@/core/shapes/outline/types";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";

export const renderOutlineToCanvas = (shape: OutlineShape, context: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const [a, b] = shape.points;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.max(1, Math.abs(b.x - a.x));
  const height = Math.max(1, Math.abs(b.y - a.y));
  const variant = resolveOutlineVariant(shape.variant);
  // The variant works in world units from the top-left corner; this maps them to the screen.
  const map = (x: number, y: number) => ({ x: (left + x) * zoom + panOffset.x, y: (top + y) * zoom + panOffset.y });
  const outline = variant.path(width, height);

  ctx.beginPath();
  tracePath(ctx, outline, map);
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();
  if (variant.details) {
    ctx.beginPath();
    tracePath(ctx, variant.details(width, height), map);
    ctx.stroke();
  }

  if (shape.label) {
    const text = variant.textRegion(width, height);
    const center = map(text.x + text.width / 2, text.y + text.height / 2);
    renderShapeLabel({
      ctx,
      label: shape.label,
      centerX: center.x,
      centerY: center.y,
      maxWidth: text.width * zoom,
      maxHeight: text.height * zoom,
      zoom,
      clipPath: (canvasContext) => {
        canvasContext.beginPath();
        tracePath(canvasContext, outline, map);
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

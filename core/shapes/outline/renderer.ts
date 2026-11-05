import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { renderShapeLabel } from "@/core/shapes/base/shape-label-renderer";
import { tracePath } from "@/core/shapes/outline/path";
import type { OutlineShape } from "@/core/shapes/outline/types";
import { paintOps } from "@/core/shapes/arrow/arrowhead";
import { isMarkerId, markerOps } from "@/core/shapes/outline/markers";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";

/** Gap between the two lines of a double border, in world units. */
const DOUBLE_GAP = 4;
/** How much heavier a thick border is than the shape's own line. */
const THICK_FACTOR = 2.2;

export const renderOutlineToCanvas = (shape: OutlineShape, context: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const { ctx, zoom, panOffset } = context;
  const [a, b] = shape.points;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.max(1, Math.abs(b.x - a.x));
  const height = Math.max(1, Math.abs(b.y - a.y));
  const variant = resolveOutlineVariant(shape.variant);
  // A stack is drawn inside the box: the front shape sits at its lower left, two copies peek out behind it.
  const step = shape.stack ? Math.min(10, Math.min(width, height) * 0.06) : 0;
  const fw = width - 2 * step;
  const fh = height - 2 * step;
  // The variant works in world units from the top-left corner; this maps them to the screen.
  const mapAt = (dx: number, dy: number) => (x: number, y: number) => ({ x: (left + dx + x) * zoom + panOffset.x, y: (top + dy + y) * zoom + panOffset.y });
  const map = mapAt(0, 2 * step);
  const outline = variant.path(fw, fh);

  const body = (dx: number, dy: number) => {
    const at = mapAt(dx, dy);
    ctx.beginPath();
    tracePath(ctx, outline, at);
    if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill();
    }
    ctx.stroke();
  };
  if (step > 0) {
    body(2 * step, 0);
    body(step, step);
  }

  const lineWidth = ctx.lineWidth;
  if (shape.border === "thick") ctx.lineWidth = lineWidth * THICK_FACTOR;
  body(0, 2 * step);
  ctx.lineWidth = lineWidth;

  if (shape.border === "double") {
    const g = Math.min(DOUBLE_GAP, Math.min(fw, fh) * 0.12);
    ctx.beginPath();
    tracePath(ctx, variant.path(fw - 2 * g, fh - 2 * g), mapAt(g, 2 * step + g));
    ctx.stroke();
  }
  if (variant.details) {
    ctx.beginPath();
    tracePath(ctx, variant.details(fw, fh), map);
    ctx.stroke();
  }

  if (isMarkerId(shape.marker)) {
    // With a label the marker rides above it; alone it sits in the middle.
    const small = Math.min(fw, fh);
    const r = (shape.label ? 0.15 : 0.22) * small;
    const c = map(fw / 2, fh * (shape.label ? 0.27 : 0.5));
    ctx.save();
    ctx.fillStyle = shape.color;
    ctx.strokeStyle = shape.color;
    paintOps(ctx, markerOps(shape.marker, c.x, c.y, r * zoom));
    ctx.restore();
  }

  if (shape.label) {
    const text = variant.textRegion(fw, fh);
    const center = map(text.x + text.width / 2, text.y + text.height / 2 + (isMarkerId(shape.marker) ? fh * 0.08 : 0));
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

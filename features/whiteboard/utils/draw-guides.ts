import type { Guide, Span } from "@/core/snap/alignment";

const GUIDE_COLOR = "#f43f5e";
const BASELINE_COLOR = "#f59e0b";
const LABEL_FONT = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Length of the end caps drawn on a measured distance, in screen pixels. */
const CAP = 4;

/** A distance as shown in a label: whole numbers as they are, otherwise one decimal. */
export const formatDistance = (world: number): string => {
  const rounded = Math.round(world * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 10;
  const h = 16;
  ctx.fillStyle = GUIDE_COLOR;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
};

/** Alignment guides: hairlines in screen space whatever the zoom, ending in small ticks. Text baselines are amber. */
export const drawGuides = (
  ctx: CanvasRenderingContext2D,
  guides: readonly Guide[],
  zoom: number,
  panOffset: { x: number; y: number },
) => {
  if (guides.length === 0) return;
  ctx.save();
  ctx.lineWidth = 1;
  for (const baseline of [false, true]) {
    ctx.strokeStyle = baseline ? BASELINE_COLOR : GUIDE_COLOR;
    ctx.setLineDash(baseline ? [2, 3] : [4, 3]);
    ctx.beginPath();
    for (const g of guides) {
      if ((g.kind === "baseline") !== baseline) continue;
      const at = g.axis === "x" ? g.at * zoom + panOffset.x : g.at * zoom + panOffset.y;
      const from = (g.axis === "x" ? g.from * zoom + panOffset.y : g.from * zoom + panOffset.x) - 6;
      const to = (g.axis === "x" ? g.to * zoom + panOffset.y : g.to * zoom + panOffset.x) + 6;
      // half-pixel offset keeps a 1px line crisp
      const crisp = Math.round(at) + 0.5;
      if (g.axis === "x") {
        ctx.moveTo(crisp, from);
        ctx.lineTo(crisp, to);
      } else {
        ctx.moveTo(from, crisp);
        ctx.lineTo(to, crisp);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
};

/**
 * Live distances and equal-spacing marks: a line between two boxes with end caps and the distance in
 * world units (the same unit the inspector shows). Everything is in screen pixels, so lines, caps and
 * labels stay one size at any zoom.
 */
export const drawSpans = (
  ctx: CanvasRenderingContext2D,
  spans: readonly Span[],
  zoom: number,
  panOffset: { x: number; y: number },
) => {
  if (spans.length === 0) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = GUIDE_COLOR;
  for (const span of spans) {
    const a = (span.axis === "x" ? span.from * zoom + panOffset.x : span.from * zoom + panOffset.y);
    const b = (span.axis === "x" ? span.to * zoom + panOffset.x : span.to * zoom + panOffset.y);
    const cross = Math.round(span.axis === "x" ? span.at * zoom + panOffset.y : span.at * zoom + panOffset.x) + 0.5;
    ctx.lineWidth = span.kind === "gap" ? 1.5 : 1;
    ctx.beginPath();
    if (span.axis === "x") {
      ctx.moveTo(a, cross);
      ctx.lineTo(b, cross);
      ctx.moveTo(a, cross - CAP);
      ctx.lineTo(a, cross + CAP);
      ctx.moveTo(b, cross - CAP);
      ctx.lineTo(b, cross + CAP);
    } else {
      ctx.moveTo(cross, a);
      ctx.lineTo(cross, b);
      ctx.moveTo(cross - CAP, a);
      ctx.lineTo(cross + CAP, a);
      ctx.moveTo(cross - CAP, b);
      ctx.lineTo(cross + CAP, b);
    }
    ctx.stroke();
    const middle = (a + b) / 2;
    const text = formatDistance(span.to - span.from);
    if (span.axis === "x") label(ctx, text, middle, cross - 12);
    else label(ctx, text, cross + 22, middle);
  }
  ctx.restore();
};

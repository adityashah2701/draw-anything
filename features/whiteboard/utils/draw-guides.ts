import type { Guide } from "@/features/whiteboard/hooks/interaction/drag-session";

const GUIDE_COLOR = "#f43f5e";

/** Alignment guides: hairlines in screen space whatever the zoom, ending in small ticks. */
export const drawGuides = (
  ctx: CanvasRenderingContext2D,
  guides: readonly Guide[],
  zoom: number,
  panOffset: { x: number; y: number },
) => {
  if (guides.length === 0) return;
  ctx.save();
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  for (const g of guides) {
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
  ctx.restore();
};

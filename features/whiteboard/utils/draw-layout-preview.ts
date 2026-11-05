import type { LayoutPreview } from "@/features/whiteboard/commands/layout-engine";

const INK = "#2563eb";

/**
 * The preview of a layout, drawn over the board and never written to it: a dashed outline where each element
 * would go and a line from where it is, so a person sees what a layout does before it happens.
 */
export const drawLayoutPreview = (ctx: CanvasRenderingContext2D, preview: LayoutPreview, zoom: number, pan: { x: number; y: number }) => {
  if (preview.moves.length === 0) return;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  for (const move of preview.moves) {
    const fx = (move.from.x + move.width / 2) * zoom + pan.x;
    const fy = (move.from.y + move.height / 2) * zoom + pan.y;
    const tx = (move.to.x + move.width / 2) * zoom + pan.x;
    const ty = (move.to.y + move.height / 2) * zoom + pan.y;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = INK;
    ctx.fillRect(move.to.x * zoom + pan.x, move.to.y * zoom + pan.y, move.width * zoom, move.height * zoom);
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(move.to.x * zoom + pan.x, move.to.y * zoom + pan.y, move.width * zoom, move.height * zoom);
  }
  ctx.restore();
};

import { selectionInk } from "@/core/theme/selection-ink";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { FRAME_PAD_PX, frameHandlePoints, type SelectionOverlay } from "./selection-overlay";

const TAG_FONT = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Screen pixels between the shapes and the dashed box drawn around them. */
const PAD = 5;
export const FRAME_HANDLE_RADIUS = 5;

const toScreen = (b: Bounds, zoom: number, pan: { x: number; y: number }) => ({
  x: b.minX * zoom + pan.x,
  y: b.minY * zoom + pan.y,
  w: (b.maxX - b.minX) * zoom,
  h: (b.maxY - b.minY) * zoom,
});

/** A small padlock, drawn with paths so it needs no icon font. */
const drawLock = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x + 4, y + 3.5, 2.6, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(x, y + 3.5, 8, 6);
  ctx.restore();
};

/** A filled tag above a box's top-left corner: the group's name, with a padlock when it is locked. */
const drawTag = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, locked: boolean, color: string) => {
  ctx.save();
  ctx.font = TAG_FONT;
  const textWidth = ctx.measureText(text).width;
  const lockWidth = locked ? 13 : 0;
  const w = textWidth + 12 + lockWidth;
  const h = 18;
  const top = Math.max(2, y - h - 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, 4);
  ctx.fill();
  if (locked) drawLock(ctx, x + 6, top + 4, "#ffffff");
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6 + lockWidth, top + h / 2 + 0.5);
  ctx.restore();
};

/**
 * Draws the selection chrome for groups and multi-selections: a dashed box per unit, a frame with
 * resize handles, a name tag on groups, and the outline of the group being edited. Everything is in
 * screen pixels, so lines, handles and text stay the same size at any zoom.
 */
export const drawSelectionOverlay = (
  ctx: CanvasRenderingContext2D,
  overlay: SelectionOverlay,
  zoom: number,
  pan: { x: number; y: number },
) => {
  ctx.save();

  if (overlay.entered) {
    const r = toScreen(overlay.entered.bounds, zoom, pan);
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = selectionInk(0.55);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x - PAD - 4, r.y - PAD - 4, r.w + 2 * (PAD + 4), r.h + 2 * (PAD + 4));
    drawTag(ctx, r.x - PAD - 4, r.y - PAD - 4, `${overlay.entered.label} ▸ editing`, false, selectionInk(0.75));
  }

  const single = overlay.units.length === 1 ? overlay.units[0] : null;

  // Several units: a dashed box around each. A lone group is drawn by the frame below.
  if (!single) {
    for (const unit of overlay.units) {
      const r = toScreen(unit.bounds, zoom, pan);
      ctx.setLineDash(unit.isGroup ? [] : [5, 4]);
      ctx.strokeStyle = unit.locked ? "#94a3b8" : selectionInk();
      ctx.lineWidth = unit.isGroup ? 1.5 : 1;
      ctx.strokeRect(r.x - PAD, r.y - PAD, r.w + 2 * PAD, r.h + 2 * PAD);
      if (unit.isGroup && unit.label) drawTag(ctx, r.x - PAD, r.y - PAD, unit.label, unit.locked, unit.locked ? "#64748b" : selectionInk());
    }
  }

  if (overlay.frame) {
    const { bounds, locked } = overlay.frame;
    const r = toScreen(bounds, zoom, pan);
    const grow = FRAME_PAD_PX;
    ctx.setLineDash([]);
    ctx.strokeStyle = locked ? "#94a3b8" : selectionInk();
    ctx.lineWidth = single ? 1.5 : 1.25;
    ctx.strokeRect(r.x - grow, r.y - grow, r.w + 2 * grow, r.h + 2 * grow);
    if (single?.isGroup && single.label) drawTag(ctx, r.x - grow, r.y - grow, single.label, single.locked, single.locked ? "#64748b" : selectionInk());
    if (!locked) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = selectionInk();
      ctx.lineWidth = 1.5;
      for (const h of frameHandlePoints(bounds, zoom)) {
        ctx.beginPath();
        ctx.arc(h.x * zoom + pan.x, h.y * zoom + pan.y, FRAME_HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.restore();
};

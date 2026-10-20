import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { FONT_FAMILY } from "@/core/text/typography";
import { frameRegions, resolveFrame } from "@/core/frames/frame-model";
import type { FrameShape } from "@/features/whiteboard/types/whiteboard.types";

const TITLE_SIZE = 13;
const TITLE_INSET = 10;
/** The header band is the border colour at this strength, so it reads on paper and on graphite alike. */
const HEADER_TINT = 0.1;

const fit = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
};

/** Draws background, border, header and title. The stroke colour is the one the editor already set for the element (theme-adapted). */
export const renderFrameToCanvas = (shape: FrameShape, { ctx, zoom, panOffset }: ShapeRenderCanvasContext) => {
  const regions = frameRegions(shape);
  if (!regions) return;
  const resolved = resolveFrame(shape);
  const x = regions.box.minX * zoom + panOffset.x;
  const y = regions.box.minY * zoom + panOffset.y;
  const w = regions.box.width * zoom;
  const h = regions.box.height * zoom;
  const radius = Math.min(resolved.cornerRadius * zoom, w / 2, h / 2);
  const border = ctx.strokeStyle;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }

  const header = regions.header;
  if (header && resolved.titlePlacement === "inside") {
    const hh = header.height * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    ctx.globalAlpha *= HEADER_TINT;
    ctx.fillStyle = border;
    ctx.fillRect(x, y, w, hh);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x, y + hh);
    ctx.lineTo(x + w, y + hh);
    ctx.stroke();
  } else if (header) {
    // A tab above the box, joined to its top-left corner.
    const tx = header.minX * zoom + panOffset.x;
    const ty = header.minY * zoom + panOffset.y;
    const tw = header.width * zoom;
    const th = header.height * zoom;
    ctx.save();
    ctx.globalAlpha *= HEADER_TINT;
    ctx.fillStyle = border;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, [Math.min(radius, th / 2), Math.min(radius, th / 2), 0, 0]);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.stroke();

  if (header) {
    const inset = TITLE_INSET * zoom;
    const size = TITLE_SIZE * zoom;
    ctx.save();
    ctx.fillStyle = border;
    ctx.font = `600 ${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const hx = header.minX * zoom + panOffset.x;
    const hy = header.minY * zoom + panOffset.y;
    const hw = header.width * zoom;
    const hh = header.height * zoom;
    ctx.fillText(fit(ctx, resolved.title, Math.max(0, hw - inset * 2)), hx + inset, hy + hh / 2);
    ctx.restore();
  }
};

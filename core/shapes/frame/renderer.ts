import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { resolveTextColor } from "@/core/shapes/base/shape-label-renderer";
import { FONT_FAMILY } from "@/core/text/typography";
import { PRESET_LOOKS, frameRegions, resolveFrame } from "@/core/frames/frame-model";
import type { FrameShape } from "@/features/whiteboard/types/whiteboard.types";

export const TITLE_SIZE = 13;
export const TITLE_INSET = 10;
/** The header band is the border colour at this strength, so it reads on paper and on graphite alike. */
const HEADER_TINT = 0.1;

/** Copies drawn without their title text, because an editor is open over it. A weak set keeps this out of the stored shape. */
const titleHidden = new WeakSet<FrameShape>();
export const withHiddenTitle = (shape: FrameShape): FrameShape => {
  const copy = { ...shape };
  titleHidden.add(copy);
  return copy;
};

const fit = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
};

/** Width of an `above` tab: the modelled width, grown to the measured title plus its insets, never wider than the box. */
const tabWidth = (ctx: CanvasRenderingContext2D, title: string, modelled: number, boxWidth: number, zoom: number) => {
  ctx.save();
  ctx.font = `600 ${TITLE_SIZE * zoom}px ${FONT_FAMILY}`;
  const measured = ctx.measureText(title).width + 2 * TITLE_INSET * zoom;
  ctx.restore();
  return Math.min(boxWidth, Math.max(modelled, measured));
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
  const look = resolved.preset ? PRESET_LOOKS[resolved.preset] : undefined;
  // A preset's header tint is its own colour; the border keeps the frame's.
  const headerInk = look?.tint ?? border;

  // The frame's opacity is the translucency of what is behind its border: the background and the header band.
  // The border and the title are always fully drawn.
  const backdrop = resolved.opacity;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  if (shape.fill) {
    ctx.save();
    ctx.globalAlpha *= backdrop;
    ctx.fillStyle = shape.fill;
    ctx.fill();
    ctx.restore();
  }

  const header = regions.header;
  if (header && resolved.titlePlacement === "inside") {
    const hh = header.height * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    ctx.globalAlpha *= HEADER_TINT * backdrop;
    ctx.fillStyle = headerInk;
    ctx.fillRect(x, y, w, hh);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x, y + hh);
    ctx.lineTo(x + w, y + hh);
    ctx.stroke();
  } else if (header) {
    // A tab above the box, joined to its top-left corner. It is as wide as the title really measures in the
    // font in use (the model's estimate is for Inter), up to the width of the box.
    const tx = header.minX * zoom + panOffset.x;
    const ty = header.minY * zoom + panOffset.y;
    const tw = tabWidth(ctx, resolved.title, header.width * zoom, w, zoom);
    const th = header.height * zoom;
    ctx.save();
    ctx.globalAlpha *= HEADER_TINT * backdrop;
    ctx.fillStyle = headerInk;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, [Math.min(radius, th / 2), Math.min(radius, th / 2), 0, 0]);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  if (look?.dash && look.dash.length > 0) ctx.setLineDash(look.dash.map((d) => d * zoom));
  ctx.stroke();
  ctx.setLineDash([]);
  // A fragment is divided into its sections (else, and) by dashed lines at the stored fractions of its height.
  if (resolved.preset === "fragment" && Array.isArray(shape.dividers)) {
    ctx.save();
    ctx.setLineDash([6 * zoom, 4 * zoom]);
    for (const f of shape.dividers) {
      if (typeof f !== "number" || !(f > 0 && f < 1)) continue;
      ctx.beginPath();
      ctx.moveTo(x, y + h * f);
      ctx.lineTo(x + w, y + h * f);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (header && !titleHidden.has(shape)) {
    const inset = TITLE_INSET * zoom;
    const size = TITLE_SIZE * zoom;
    ctx.save();
    ctx.fillStyle = resolveTextColor(shape.color, shape.fill);
    ctx.font = `600 ${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const hx = header.minX * zoom + panOffset.x;
    const hy = header.minY * zoom + panOffset.y;
    const hw = resolved.titlePlacement === "inside" ? header.width * zoom : tabWidth(ctx, resolved.title, header.width * zoom, w, zoom);
    const hh = header.height * zoom;
    const label = resolved.preset === "fragment" && resolved.operator ? `${resolved.operator} ${resolved.title === "Frame" ? "" : resolved.title}`.trim() : resolved.title;
    ctx.fillText(fit(ctx, label, Math.max(0, hw - inset * 2)), hx + inset, hy + hh / 2);
    ctx.restore();
  }
};

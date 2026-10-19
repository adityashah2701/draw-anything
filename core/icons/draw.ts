import { makeFontString } from "@/core/text/typography";
import { categoryTint, type IconDef } from "./registry";

/** A context that takes glyph path data directly (the SVG export), so it needs no Path2D object. */
export interface PathDataSink {
  /** An explicit marker: a method-name check would also match test doubles that answer to any name. */
  readonly isPathDataSink: true;
  /** `extent` is the glyph's coordinate box; it defaults to the 24-unit box lucide icons use. */
  strokePathData(data: string, extent?: { width: number; height: number }): void;
  fillPathData(data: string, extent?: { width: number; height: number }): void;
}
const takesPathData = (ctx: unknown): ctx is PathDataSink => (ctx as Partial<PathDataSink>).isPathDataSink === true;

const GLYPH_SHARE = 0.62; // glyph size relative to its tile
const STROKE = 2; // lucide's stroke width in its 24-unit space
const pathCache = new Map<string, Path2D>();

const pathFor = (def: IconDef): Path2D | null => {
  if (typeof Path2D === "undefined") return null;
  const cacheKey = def.id + def.paths.join("|");
  let path = pathCache.get(cacheKey);
  if (!path) {
    try {
      path = new Path2D();
      for (const d of def.paths) path.addPath(new Path2D(d));
    } catch {
      return null;
    }
    pathCache.set(cacheKey, path);
  }
  return path;
};

/** Paints the glyph (not its tile) centred at (cx, cy) inside a `box` px square; `color` overrides the icon's own. */
const paintGlyph = (ctx: CanvasRenderingContext2D, def: IconDef, cx: number, cy: number, box: number, color: string, strokeWidth?: number) => {
  const logo = def.style === "logo";
  const sink = takesPathData(ctx);
  const path = sink ? null : pathFor(def);
  if (!sink && !path) return false;
  const scale = box / Math.max(def.viewBox.width, def.viewBox.height);
  ctx.translate(cx - (def.viewBox.width * scale) / 2, cy - (def.viewBox.height * scale) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth ?? def.strokeWidth ?? STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // One call per path string: a relative "m" in a later path starts at the origin, not where the last one ended.
  if (sink) for (const d of def.paths) logo ? ctx.fillPathData(d, def.viewBox) : ctx.strokePathData(d, def.viewBox);
  else if (logo) ctx.fill(path!);
  else ctx.stroke(path!);
  return true;
};

/**
 * A standalone icon: just the glyph filling a `size` px square at (cx, cy), in `color` (default: the icon's
 * own). Brand marks keep their colours on a white tile, since they are drawn for light backgrounds. Falls
 * back to the text badge if the glyph cannot be drawn.
 */
export const drawIconGlyph = (ctx: CanvasRenderingContext2D, def: IconDef, cx: number, cy: number, size: number, color?: string, strokeWidth?: number) => {
  const logo = def.style === "logo";
  const tint = color ?? def.color ?? categoryTint(def.category);
  ctx.save();
  if (logo) {
    ctx.beginPath();
    ctx.roundRect(cx - size / 2, cy - size / 2, size, size, size * 0.2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (!paintGlyph(ctx, def, cx, cy, logo ? size * 0.68 : size * 0.92, logo ? (def.color ?? tint) : tint, strokeWidth)) {
    ctx.fillStyle = tint;
    ctx.font = makeFontString(Math.max(6, size * 0.34), 700, "normal");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.badge, cx, cy);
  }
  ctx.restore();
};

/**
 * Draws an icon tile centred at (cx, cy), `size` screen pixels square, in `color` instead of the icon's
 * own when given. Everything scales from `size`,
 * so a glyph looks the same at every zoom. If the glyph cannot be drawn (no Path2D, bad path data),
 * the registry's short text badge is drawn instead, so a node never loses its icon slot.
 */
export const drawIconTile = (ctx: CanvasRenderingContext2D, def: IconDef, cx: number, cy: number, size: number, color?: string) => {
  const logo = def.style === "logo";
  // `color` retints a line icon; a brand mark keeps its own colours.
  const tint = (logo ? undefined : color) ?? def.color ?? categoryTint(def.category);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - size / 2, cy - size / 2, size, size, Math.min(size * 0.25, size / 2));
  // A brand mark needs a neutral ground to keep its own colours; line icons sit on a faint tint of theirs.
  ctx.fillStyle = logo ? "#ffffff" : tint;
  // Relative to the alpha the element is drawn with (its `opacity`), so a faded node fades its icon tile too.
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (logo ? 1 : 0.14);
  ctx.fill();
  ctx.globalAlpha = alpha;
  if (logo) {
    ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (!paintGlyph(ctx, def, cx, cy, size * GLYPH_SHARE, tint)) {
    ctx.fillStyle = tint;
    ctx.font = makeFontString(Math.max(6, size * 0.34), 700, "normal");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.badge, cx, cy);
  }
  ctx.restore();
};

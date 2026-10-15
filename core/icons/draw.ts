import { makeFontString } from "@/core/text/typography";
import { categoryTint, type IconDef } from "./registry";

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

/**
 * Draws an icon tile centred at (cx, cy), `size` screen pixels square. Everything scales from `size`,
 * so a glyph looks the same at every zoom. If the glyph cannot be drawn (no Path2D, bad path data),
 * the registry's short text badge is drawn instead, so a node never loses its icon slot.
 */
export const drawIconTile = (ctx: CanvasRenderingContext2D, def: IconDef, cx: number, cy: number, size: number) => {
  const tint = categoryTint(def.category);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - size / 2, cy - size / 2, size, size, Math.min(size * 0.25, size / 2));
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.14;
  ctx.fill();
  ctx.globalAlpha = 1;

  const path = pathFor(def);
  if (path) {
    const box = size * GLYPH_SHARE;
    const scale = box / Math.max(def.viewBox.width, def.viewBox.height);
    ctx.translate(cx - (def.viewBox.width * scale) / 2, cy - (def.viewBox.height * scale) / 2);
    ctx.scale(scale, scale);
    ctx.strokeStyle = tint;
    ctx.lineWidth = STROKE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(path);
  } else {
    ctx.fillStyle = tint;
    ctx.font = makeFontString(Math.max(6, size * 0.34), 700, "normal");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.badge, cx, cy);
  }
  ctx.restore();
};

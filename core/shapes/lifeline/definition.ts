import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { boxDefinition, boxOf } from "@/core/shapes/structured/box-definition";
import { estimateTextWidth } from "@/core/text/estimate";
import { FONT_FAMILY } from "@/core/text/typography";
import type { LifelineShape } from "@/features/whiteboard/types/whiteboard.types";

export const HEAD_HEIGHT = 48;
export const BODY_WIDTH = 16;

/** The head's width: as wide as the name needs, never narrower than the lifeline's own box. */
export const headWidth = (shape: Pick<LifelineShape, "name">) => Math.max(130, Math.ceil(estimateTextWidth(shape.name ?? "Participant", 16, "600") + 44));

/** The y (world) of a fraction of the lifeline's body, for placing a message on it. */
export const bodyY = (shape: Pick<LifelineShape, "points">, fraction: number) => {
  const b = boxOf(shape);
  return b.y + b.height * Math.max(0, Math.min(1, fraction));
};

const render = (shape: LifelineShape, { ctx, zoom, panOffset }: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const b = boxOf(shape);
  const cx = (b.x + b.width / 2) * zoom + panOffset.x;
  const top = b.y * zoom + panOffset.y;
  const bottom = (b.y + b.height) * zoom + panOffset.y;
  const hw = headWidth(shape) * zoom, hh = HEAD_HEIGHT * zoom;
  const ink = String(ctx.strokeStyle);
  ctx.save();
  // The head sits above the body.
  if ((shape.head ?? "box") === "actor") {
    const r = 7 * zoom, hy = top - hh + r + 2 * zoom;
    ctx.beginPath();
    ctx.arc(cx, hy, r, 0, Math.PI * 2);
    ctx.moveTo(cx, hy + r); ctx.lineTo(cx, hy + r + 12 * zoom);
    ctx.moveTo(cx - 9 * zoom, hy + r + 6 * zoom); ctx.lineTo(cx + 9 * zoom, hy + r + 6 * zoom);
    ctx.moveTo(cx, hy + r + 12 * zoom); ctx.lineTo(cx - 7 * zoom, top - 2 * zoom);
    ctx.moveTo(cx, hy + r + 12 * zoom); ctx.lineTo(cx + 7 * zoom, top - 2 * zoom);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(cx - hw / 2, top - hh, hw, hh, 6 * zoom);
    if (shape.fill) { ctx.fillStyle = shape.fill; ctx.fill(); }
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${16 * zoom}px ${FONT_FAMILY}`;
  ctx.fillText(shape.name ?? "Participant", cx, (shape.head ?? "box") === "actor" ? top + 10 * zoom : top - hh / 2);
  // The dashed line down the body; activations are bars on it.
  ctx.setLineDash([6 * zoom, 5 * zoom]);
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const a of shape.activations ?? []) {
    if (typeof a.from !== "number" || typeof a.to !== "number" || !(a.to > a.from)) continue;
    const y0 = top + (bottom - top) * Math.max(0, Math.min(1, a.from)), y1 = top + (bottom - top) * Math.max(0, Math.min(1, a.to));
    ctx.fillStyle = shape.fill ?? "#ffffff";
    ctx.fillRect(cx - (BODY_WIDTH / 2) * zoom, y0, BODY_WIDTH * zoom, y1 - y0);
    ctx.strokeRect(cx - (BODY_WIDTH / 2) * zoom, y0, BODY_WIDTH * zoom, y1 - y0);
  }
  ctx.restore();
};

export const lifelineDefinition = boxDefinition<LifelineShape>({
  type: "lifeline",
  create: (props) => ({
    id: props.id ?? "", type: "lifeline", color: props.color ?? "#000000", strokeWidth: props.strokeWidth ?? 2, fill: props.fill, name: props.name ?? "Participant",
    head: props.head, activations: props.activations,
    points: props.points ?? [{ x: 0, y: HEAD_HEIGHT }, { x: BODY_WIDTH, y: 420 }],
  }),
  render,
  minSize: () => ({ width: BODY_WIDTH, height: 60 }),
});

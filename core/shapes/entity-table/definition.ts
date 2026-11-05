import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { boxDefinition, boxOf } from "@/core/shapes/structured/box-definition";
import { FONT_FAMILY } from "@/core/text/typography";
import type { EntityTableShape } from "@/features/whiteboard/types/whiteboard.types";
import { PAD_X, layoutEntityTable, markerText, rowsOf } from "./layout";

const render = (shape: EntityTableShape, { ctx, zoom, panOffset }: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const b = boxOf(shape);
  const layout = layoutEntityTable(shape);
  const x = b.x * zoom + panOffset.x, y = b.y * zoom + panOffset.y, w = b.width * zoom, h = b.height * zoom;
  const ink = String(ctx.strokeStyle);
  const kind = shape.kind ?? "strong";
  const rows = kind === "junction" ? rowsOf(shape).filter((r) => r.keys?.includes("fk")) : rowsOf(shape);

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  if (shape.fill) { ctx.fillStyle = shape.fill; ctx.fill(); }
  ctx.stroke();
  if (kind === "weak") {
    // A weak entity has a second line just inside the first.
    ctx.beginPath();
    ctx.roundRect(x + 3 * zoom, y + 3 * zoom, w - 6 * zoom, h - 6 * zoom, 4 * zoom);
    ctx.stroke();
  }
  // The header: tinted with the border colour (muted for a junction), with the name, and a corner mark for an associative entity.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6 * zoom);
  ctx.clip();
  ctx.globalAlpha *= kind === "junction" ? 0.05 : 0.14;
  ctx.fillStyle = ink;
  ctx.fillRect(x, y, w, layout.headerHeight * zoom);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(x, y + layout.headerHeight * zoom);
  ctx.lineTo(x + w, y + layout.headerHeight * zoom);
  ctx.stroke();
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 ${14 * zoom}px ${FONT_FAMILY}`;
  ctx.fillText(shape.name ?? "Entity", x + PAD_X * zoom, y + (layout.headerHeight / 2) * zoom);
  if (kind === "associative") {
    ctx.beginPath();
    ctx.moveTo(x + w - 16 * zoom, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + 16 * zoom);
    ctx.closePath();
    ctx.fill();
  }
  rows.forEach((row, i) => {
    const cy = y + (layout.headerHeight + i * layout.rowHeight + layout.rowHeight / 2) * zoom;
    ctx.font = `600 ${11 * zoom}px ${FONT_FAMILY}`;
    ctx.fillText(markerText(row), x + layout.columns.marker * zoom, cy);
    ctx.font = `${row.keys?.includes("pk") ? 700 : 500} ${13 * zoom}px ${FONT_FAMILY}`;
    ctx.fillText(row.name + (row.nullable ? "?" : ""), x + layout.columns.name * zoom, cy);
    if (row.type) {
      ctx.font = `400 ${13 * zoom}px ${FONT_FAMILY}`;
      ctx.globalAlpha *= 0.65;
      ctx.fillText(row.type, x + layout.columns.type * zoom, cy);
      ctx.globalAlpha /= 0.65;
    }
    if (i > 0) {
      ctx.save();
      ctx.globalAlpha *= 0.15;
      ctx.beginPath();
      ctx.moveTo(x, cy - (layout.rowHeight / 2) * zoom);
      ctx.lineTo(x + w, cy - (layout.rowHeight / 2) * zoom);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.restore();
};

export const entityTableDefinition = boxDefinition<EntityTableShape>({
  type: "entity-table",
  create: (props) => {
    const base: EntityTableShape = { id: props.id ?? "", type: "entity-table", points: props.points ?? [{ x: 0, y: 0 }, { x: 180, y: 120 }], color: props.color ?? "#000000", strokeWidth: props.strokeWidth ?? 2, fill: props.fill, kind: props.kind, name: props.name ?? "Entity", rows: props.rows ?? [] };
    const size = layoutEntityTable(base);
    const [a] = base.points;
    return props.points ? base : { ...base, points: [a, { x: a.x + Math.max(180, size.minWidth), y: a.y + size.minHeight }] };
  },
  render,
  minSize: (shape) => {
    const l = layoutEntityTable(shape);
    return { width: l.minWidth, height: l.minHeight };
  },
});

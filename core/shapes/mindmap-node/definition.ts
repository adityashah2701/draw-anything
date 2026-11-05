import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { boxDefinition, boxOf } from "@/core/shapes/structured/box-definition";
import { estimateTextWidth } from "@/core/text/estimate";
import { FONT_FAMILY } from "@/core/text/typography";
import type { MindmapNodeShape } from "@/features/whiteboard/types/whiteboard.types";

const SIZE: Record<NonNullable<MindmapNodeShape["role"]>, { font: number; weight: number; padX: number; height: number }> = {
  central: { font: 20, weight: 700, padX: 28, height: 64 },
  main: { font: 16, weight: 600, padX: 20, height: 44 },
  sub: { font: 14, weight: 500, padX: 16, height: 36 },
  leaf: { font: 13, weight: 400, padX: 12, height: 30 },
};

export const mindmapSize = (shape: Pick<MindmapNodeShape, "role" | "label">) => {
  const s = SIZE[shape.role ?? "sub"];
  // 15% over the Inter estimate: the viewer's own font can be wider, and the label must stay inside its pill.
  return { width: Math.max(80, Math.ceil(estimateTextWidth(shape.label || "Topic", s.font, String(s.weight)) * 1.15 + s.padX * 2)), height: s.height };
};

const render = (shape: MindmapNodeShape, { ctx, zoom, panOffset }: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const b = boxOf(shape);
  const role = shape.role ?? "sub";
  const s = SIZE[role];
  const x = b.x * zoom + panOffset.x, y = b.y * zoom + panOffset.y, w = b.width * zoom, h = b.height * zoom;
  const accent = shape.branchColor ?? String(ctx.strokeStyle);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(h / 2, 24 * zoom));
  if (role === "central") { ctx.fillStyle = accent; ctx.fill(); }
  else if (role === "main") { ctx.globalAlpha *= 0.18; ctx.fillStyle = accent; ctx.fill(); ctx.globalAlpha /= 0.18; ctx.strokeStyle = accent; ctx.stroke(); }
  else if (role === "sub") { ctx.strokeStyle = accent; ctx.stroke(); }
  ctx.fillStyle = role === "central" ? "#ffffff" : String(ctx.strokeStyle === accent && role !== "leaf" ? shape.color : shape.color);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${s.weight} ${s.font * zoom}px ${FONT_FAMILY}`;
  ctx.fillText(shape.label || "Topic", x + w / 2, y + h / 2);
  if (shape.collapsed) {
    // A collapsed topic shows a small dot on its outer edge: there is more behind it.
    ctx.beginPath();
    ctx.arc(x + w + 6 * zoom, y + h / 2, 4 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  ctx.restore();
};

export const mindmapNodeDefinition = boxDefinition<MindmapNodeShape>({
  type: "mindmap-node",
  create: (props) => {
    const base: MindmapNodeShape = { id: props.id ?? "", type: "mindmap-node", color: props.color ?? "#000000", strokeWidth: props.strokeWidth ?? 2, label: props.label ?? "Topic", role: props.role, parentId: props.parentId, collapsed: props.collapsed, branchColor: props.branchColor, points: props.points ?? [{ x: 0, y: 0 }, { x: 120, y: 40 }] };
    if (props.points) return base;
    const size = mindmapSize(base);
    return { ...base, points: [base.points[0], { x: base.points[0].x + size.width, y: base.points[0].y + size.height }] };
  },
  render,
  minSize: (shape) => mindmapSize(shape),
});

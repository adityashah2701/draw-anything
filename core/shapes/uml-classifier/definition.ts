import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { boxDefinition, boxOf } from "@/core/shapes/structured/box-definition";
import { FONT_FAMILY } from "@/core/text/typography";
import type { UmlClassifierShape } from "@/features/whiteboard/types/whiteboard.types";
import { LINE, PAD, layoutClassifier, memberLines, stereotypeOf } from "./layout";
import { parseMember } from "./members";

const render = (shape: UmlClassifierShape, { ctx, zoom, panOffset }: ShapeRenderCanvasContext) => {
  if (shape.points.length < 2) return;
  const b = boxOf(shape);
  const l = layoutClassifier(shape);
  const x = b.x * zoom + panOffset.x, y = b.y * zoom + panOffset.y, w = b.width * zoom, h = b.height * zoom;
  const ink = String(ctx.strokeStyle);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  if (shape.fill) { ctx.fillStyle = shape.fill; ctx.fill(); }
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  const centred = w / 2;
  // Header: stereotype in guillemets, then the name (italic when abstract, underlined for an object).
  let cy = y + 14 * zoom;
  const stereo = stereotypeOf(shape);
  if (stereo) {
    ctx.textAlign = "center";
    ctx.font = `400 ${11 * zoom}px ${FONT_FAMILY}`;
    ctx.fillText(`«${stereo}»`, x + centred, y + 11 * zoom);
    cy = y + (LINE + 14) * zoom;
  }
  ctx.textAlign = "center";
  ctx.font = `${shape.kind === "abstract" ? "italic " : ""}700 ${14 * zoom}px ${FONT_FAMILY}`;
  const name = shape.name ?? "Class";
  ctx.fillText(name, x + centred, cy);
  if (shape.kind === "object") {
    const half = ctx.measureText(name).width / 2;
    ctx.beginPath();
    ctx.moveTo(x + centred - half, cy + 8 * zoom);
    ctx.lineTo(x + centred + half, cy + 8 * zoom);
    ctx.stroke();
  }
  let top = y + l.header * zoom;
  const compartment = (list: string[], height: number) => {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + w, top);
    ctx.stroke();
    ctx.textAlign = "left";
    list.forEach((line, i) => {
      const m = parseMember(line);
      const ly = top + (4 + i * LINE + LINE / 2) * zoom;
      ctx.font = `${m?.abstract ? "italic " : ""}400 ${12 * zoom}px ${FONT_FAMILY}`;
      ctx.fillText(line.replace(/\{(static|abstract)\}\s*/, ""), x + PAD * zoom, ly);
      if (m?.static) {
        const tw = ctx.measureText(line.replace(/\{(static|abstract)\}\s*/, "")).width;
        ctx.beginPath();
        ctx.moveTo(x + PAD * zoom, ly + 7 * zoom);
        ctx.lineTo(x + PAD * zoom + tw, ly + 7 * zoom);
        ctx.stroke();
      }
    });
    top += height * zoom;
  };
  if (l.showAttributes) compartment(memberLines(shape.attributes), l.attributes);
  if (l.showOperations) compartment(memberLines(shape.operations), l.operations);
  ctx.restore();

  // A template class carries its parameters in a dashed box on the top-right corner.
  if (shape.template) {
    ctx.save();
    ctx.font = `400 ${11 * zoom}px ${FONT_FAMILY}`;
    const tw = ctx.measureText(shape.template).width + 12 * zoom;
    ctx.setLineDash([4 * zoom, 3 * zoom]);
    ctx.strokeRect(x + w - tw + 6 * zoom, y - 10 * zoom, tw, 20 * zoom);
    ctx.setLineDash([]);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.template, x + w - tw / 2 + 6 * zoom, y);
    ctx.restore();
  }
  void h;
};

export const umlClassifierDefinition = boxDefinition<UmlClassifierShape>({
  type: "uml-classifier",
  create: (props) => {
    const base: UmlClassifierShape = {
      id: props.id ?? "", type: "uml-classifier", color: props.color ?? "#000000", strokeWidth: props.strokeWidth ?? 2, fill: props.fill,
      points: props.points ?? [{ x: 0, y: 0 }, { x: 160, y: 100 }], kind: props.kind, name: props.name ?? "Class", stereotype: props.stereotype, template: props.template,
      attributes: props.attributes, operations: props.operations, collapsed: props.collapsed,
    };
    if (props.points) return base;
    const l = layoutClassifier(base);
    return { ...base, points: [base.points[0], { x: base.points[0].x + l.minWidth, y: base.points[0].y + l.minHeight }] };
  },
  render,
  minSize: (shape) => {
    const l = layoutClassifier(shape);
    return { width: l.minWidth, height: l.minHeight };
  },
});

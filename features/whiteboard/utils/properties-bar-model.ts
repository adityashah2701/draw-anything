import { expandUnits, isEffectivelyLocked, selectionUnits, type GroupIndex } from "@/core/groups/group-index";
import { resolveFrame } from "@/core/frames/frame-model";
import { CORNER_RADIUS } from "@/core/shapes/base/geometry-tokens";
import { getOutlineVariant, listOutlineVariants } from "@/core/shapes/outline/variants";
import { getArrowHeadVisibility, isArrowElement, type ArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { normalizeNodeStyle } from "@/core/shapes/semantic-node/style";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import { DEFAULT_LABEL_FONT_SIZE } from "@/core/text/label-layout";
import type { ArrowRoutingMode, DrawingElement, FrameShape } from "@/features/whiteboard/types/whiteboard.types";
import type { Mixed } from "@/features/whiteboard/utils/inspector-model";

/**
 * What the bottom properties bar shows for a selection, as plain data. A section is `null` when no selected
 * shape has that property, so the bar never offers a control that would do nothing. A value is "mixed" when
 * the shapes that have the property disagree: the bar then shows no value rather than the first shape's.
 * Each section lists the ids it edits, so a mixed selection only changes the shapes the property means
 * something for (a font size is never stored on a rectangle without a label).
 */
export interface PropertiesBarModel {
  /** Short description of the selection: "Rectangle", "Text", "3 objects", "Group". */
  title: string;
  /** Every selected unit is locked: nothing can be edited. */
  locked: boolean;
  /** Some selected units are locked and are left out of every edit. */
  partlyLocked: boolean;
  /** Editable shapes (groups expanded to their members). */
  targetIds: string[];
  stroke: { color: Mixed<string>; width: Mixed<number> | null; colorIds: string[]; widthIds: string[]; colorLabel: "Stroke" | "Text color" | "Color" } | null;
  fill: { value: Mixed<string>; ids: string[] } | null;
  border: { radius: Mixed<number>; ids: string[] } | null;
  text: { size: Mixed<number>; ids: string[] } | null;
  /** Outline shapes: which variant they are, and the others they can become. */
  variant: { value: Mixed<string>; ids: string[]; options: Array<{ id: string; label: string }> } | null;
  opacity: Mixed<number>;
  /** Frame-only properties: the title, how it is shown, the padding around contents, whether it fits them. */
  frame: {
    ids: string[];
    title: Mixed<string>;
    header: Mixed<FrameHeader>;
    padding: Mixed<number>;
    autoFit: Mixed<boolean>;
  } | null;
  connector: {
    ids: string[];
    dashed: Mixed<boolean>;
    routing: Mixed<ArrowRoutingMode>;
    headStart: Mixed<boolean>;
    headEnd: Mixed<boolean>;
  } | null;
}

/** Where a frame's title sits: in a band, on a tab above the box, or not at all. */
export type FrameHeader = "inside" | "above" | "hidden";

const same = <T>(values: readonly T[]): Mixed<T> => (values.every((value) => value === values[0]) ? values[0] : "mixed");

const supports = (shape: DrawingElement, key: "supportsFill" | "supportsStrokeWidth") =>
  getShapeDefinition(shape.type)?.propertiesConfig?.[key] === true;

const hasLabelText = (shape: DrawingElement) => shape.type === "text" || (typeof shape.label === "string" && shape.label.trim() !== "");

const TITLES: Record<string, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  circle: "Circle",
  diamond: "Diamond",
  triangle: "Triangle",
  pill: "Pill",
  line: "Line",
  arrow: "Connector",
  "arrow-bidirectional": "Connector",
  freehand: "Drawing",
  text: "Text",
  icon: "Icon",
  "semantic-node": "Node",
  frame: "Frame",
};

const radiusOf = (shape: DrawingElement): number | null => {
  if (shape.type === "rectangle") return (shape as { cornerRadius?: number }).cornerRadius ?? CORNER_RADIUS.rectangle;
  if (shape.type === "frame") return resolveFrame(shape).cornerRadius;
  if (shape.type === "semantic-node") return normalizeNodeStyle(shape.nodeStyle).cornerRadius ?? CORNER_RADIUS.semanticNode;
  return null;
};

const titleOf = (units: number, isGroup: boolean, targets: readonly DrawingElement[]): string => {
  if (isGroup) return "Group";
  if (units > 1) return `${units} objects`;
  const first = targets[0];
  if (first?.type === "outline") return getOutlineVariant(first.variant)?.label ?? "Shape";
  return TITLES[first?.type] ?? "Object";
};

export const readPropertiesBar = (index: GroupIndex, selected: readonly string[]): PropertiesBarModel | null => {
  const units = selectionUnits(index, selected);
  if (units.length === 0) return null;

  const editableUnits = units.filter((unit) => !isEffectivelyLocked(index, unit));
  const targetIds = expandUnits(index, editableUnits);
  const targets = targetIds.flatMap((id) => index.shapes.get(id) ?? []);
  const title = titleOf(units.length, units.length === 1 && index.groups.has(units[0]), targets.length > 0 ? targets : expandUnits(index, units).flatMap((id) => index.shapes.get(id) ?? []));

  const base = { title, locked: editableUnits.length === 0, partlyLocked: editableUnits.length > 0 && editableUnits.length < units.length, targetIds };
  if (targets.length === 0) return { ...base, stroke: null, fill: null, border: null, text: null, opacity: 1, variant: null, frame: null, connector: null };

  const idsOf = (shapes: readonly DrawingElement[]) => shapes.map((shape) => shape.id);
  const strokable = targets.filter((shape) => supports(shape, "supportsStrokeWidth"));
  const fillable = targets.filter((shape) => supports(shape, "supportsFill"));
  const rounded = targets.filter((shape) => radiusOf(shape) !== null);
  const texty = targets.filter(hasLabelText);
  const outlines = targets.filter((shape): shape is Extract<DrawingElement, { type: "outline" }> => shape.type === "outline");
  const connectors = targets.filter(isArrowElement) as ArrowElement[];
  const frames = targets.filter((shape): shape is FrameShape => shape.type === "frame");
  const onlyText = targets.every((shape) => shape.type === "text");

  return {
    ...base,
    stroke: {
      color: same(targets.map((shape) => (shape.color ?? "#000000").toLowerCase())),
      width: strokable.length > 0 ? same(strokable.map((shape) => shape.strokeWidth)) : null,
      colorIds: idsOf(targets),
      widthIds: idsOf(strokable),
      colorLabel: onlyText ? "Text color" : strokable.length > 0 ? "Stroke" : "Color",
    },
    fill: fillable.length > 0 ? { value: same(fillable.map((shape) => (shape.fill && shape.fill !== "#transparent" ? shape.fill.toLowerCase() : "transparent"))), ids: idsOf(fillable) } : null,
    border: rounded.length > 0 ? { radius: same(rounded.map((shape) => radiusOf(shape) ?? 0)), ids: idsOf(rounded) } : null,
    text: texty.length > 0 ? { size: same(texty.map((shape) => shape.fontSize ?? DEFAULT_LABEL_FONT_SIZE)), ids: idsOf(texty) } : null,
    variant: outlines.length > 0 ? { value: same(outlines.map((shape) => shape.variant)), ids: idsOf(outlines), options: listOutlineVariants().map(({ id, label }) => ({ id, label })) } : null,
    opacity: same(targets.map((shape) => shape.opacity ?? 1)),
    frame:
      frames.length > 0
        ? {
            ids: idsOf(frames),
            title: same(frames.map((frame) => resolveFrame(frame).title)),
            header: same(frames.map((frame): FrameHeader => { const r = resolveFrame(frame); return !r.headerVisible ? "hidden" : r.titlePlacement; })),
            padding: same(frames.map((frame) => resolveFrame(frame).padding)),
            autoFit: same(frames.map((frame) => resolveFrame(frame).autoFit)),
          }
        : null,
    connector:
      connectors.length > 0
        ? {
            ids: idsOf(connectors),
            dashed: same(connectors.map((arrow) => Boolean(arrow.dashed))),
            routing: same(connectors.map((arrow) => arrow.routingMode ?? "orthogonal")),
            headStart: same(connectors.map((arrow) => getArrowHeadVisibility(arrow).start)),
            headEnd: same(connectors.map((arrow) => getArrowHeadVisibility(arrow).end)),
          }
        : null,
  };
};

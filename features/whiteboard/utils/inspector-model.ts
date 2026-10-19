import { unionBounds } from "@/core/geometry/box";
import {
  expandUnits,
  groupLabel,
  isEffectivelyLocked,
  leavesOfUnit,
  selectionUnits,
  type GroupIndex,
} from "@/core/groups/group-index";
import { getShapeDefinition, getShapeLocalBounds, getShapeRotation, isRotatable } from "@/core/shapes/shape-runtime";
import { CORNER_RADIUS } from "@/core/shapes/base/geometry-tokens";
import { DEFAULT_LABEL_FONT_SIZE } from "@/core/text/label-layout";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

/** A value shared by every selected shape, or "mixed" when they differ. */
export type Mixed<T> = T | "mixed";

export interface InspectorFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type InspectorRotation =
  /** One shape that can turn: its own angle, in degrees. */
  | { mode: "absolute"; value: number }
  /** Anything else that can turn (a group, several shapes, a line): "rotate the selection by". */
  | { mode: "relative" }
  | { mode: "none" };

export interface InspectorModel {
  /** Selection units: a group counts as one. */
  unitCount: number;
  /** Units that can be changed (not locked). */
  editableUnitCount: number;
  /** Every selected unit is locked: nothing can be edited. */
  locked: boolean;
  /** Some, but not all, selected units are locked. */
  partlyLocked: boolean;
  /** X, Y, width and height of what an edit would change. */
  frame: InspectorFrame | null;
  /** The frame is the shape's own (unrotated) box rather than the box around the selection. */
  frameIsLocal: boolean;
  rotation: InspectorRotation;
  /** Set when the selection is exactly one group. */
  group: { id: string; name: string; rawName: string } | null;
  style: {
    color: Mixed<string> | null;
    fill: Mixed<string> | null;
    strokeWidth: Mixed<number> | null;
    fontSize: Mixed<number> | null;
    /** 0 to 1; shown for every selection. */
    opacity: Mixed<number> | null;
    /** Rectangles only (semantic nodes have their own in the Node section). */
    cornerRadius: Mixed<number> | null;
  };
  /** Set when the selection is exactly one connector: its id and the text of its label ("" when it has none). */
  connector: { id: string; label: string } | null;
  /** The shapes edits apply to (editable units' shapes), in stacking order. */
  targetIds: string[];
}

const same = <T>(values: readonly T[]): Mixed<T> | null => {
  if (values.length === 0) return null;
  return values.every((value) => value === values[0]) ? values[0] : "mixed";
};

const supports = (shape: DrawingElement, key: "supportsFill" | "supportsStrokeWidth") =>
  getShapeDefinition(shape.type)?.propertiesConfig?.[key] === true;

const hasLabelText = (shape: DrawingElement) => shape.type === "text" || (typeof shape.label === "string" && shape.label.trim() !== "");

const isConnectorShape = (shape: DrawingElement) => shape.type === "arrow" || shape.type === "arrow-bidirectional";

const isPolyline = (shape: DrawingElement) =>
  shape.type === "line" || shape.type === "arrow" || shape.type === "arrow-bidirectional" || shape.type === "freehand";

/**
 * Everything the inspector shows for a selection, as plain data. X/Y/W/H describe the box around
 * what an edit would change (locked units are not part of it); for one rotated shape they describe
 * the shape's own unrotated box, which is what a person typing a width means.
 */
export const readInspector = (
  index: GroupIndex,
  selected: readonly string[],
  getBounds: (shapeId: string) => Bounds | null,
): InspectorModel | null => {
  const units = selectionUnits(index, selected);
  if (units.length === 0) return null;

  const editableUnits = units.filter((unit) => !isEffectivelyLocked(index, unit));
  const framedUnits = editableUnits.length > 0 ? editableUnits : units;
  const targetIds = expandUnits(index, editableUnits);
  const targets = targetIds.flatMap((id) => index.shapes.get(id) ?? []);

  const only = units.length === 1 && index.shapes.has(units[0]) ? index.shapes.get(units[0])! : null;
  const rotated = only && getShapeRotation(only) !== 0;
  const localBox = rotated ? getShapeLocalBounds(only) : null;
  const box = localBox ?? unionBounds(framedUnits.flatMap((unit) => leavesOfUnit(index, unit).flatMap((id) => getBounds(id) ?? [])));

  let rotation: InspectorRotation = { mode: "none" };
  if (editableUnits.length > 0) {
    if (only && isRotatable(only.type)) rotation = { mode: "absolute", value: getShapeRotation(only) };
    else if (targets.some((shape) => isRotatable(shape.type) || isPolyline(shape))) rotation = { mode: "relative" };
  }

  const group = units.length === 1 ? index.groups.get(units[0]) : undefined;
  const fillable = targets.filter((shape) => supports(shape, "supportsFill"));
  const strokable = targets.filter((shape) => supports(shape, "supportsStrokeWidth"));
  const texty = targets.filter(hasLabelText);
  const rounded = targets.filter((shape) => shape.type === "rectangle") as Array<DrawingElement & { cornerRadius?: number }>;
  const onlyConnector = only && isConnectorShape(only) ? only : null;
  const connectorLabel = onlyConnector
    ? [...index.shapes.values()].find((shape) => shape.ai?.role === "edge-label" && shape.ai.semanticId === `${onlyConnector.ai?.semanticId ?? onlyConnector.id}-label`)
    : undefined;

  return {
    unitCount: units.length,
    editableUnitCount: editableUnits.length,
    locked: editableUnits.length === 0,
    partlyLocked: editableUnits.length > 0 && editableUnits.length < units.length,
    frame: box ? { x: box.minX, y: box.minY, width: box.width, height: box.height } : null,
    frameIsLocal: !!localBox,
    rotation,
    group: group ? { id: group.id, name: groupLabel(group), rawName: group.name ?? "" } : null,
    style: {
      color: same(targets.map((shape) => shape.color)),
      fill: same(fillable.map((shape) => shape.fill || "transparent")),
      strokeWidth: same(strokable.map((shape) => shape.strokeWidth)),
      fontSize: same(texty.map((shape) => shape.fontSize ?? DEFAULT_LABEL_FONT_SIZE)),
      opacity: same(targets.map((shape) => shape.opacity ?? 1)),
      cornerRadius: same(rounded.map((shape) => shape.cornerRadius ?? CORNER_RADIUS.rectangle)),
    },
    connector: onlyConnector ? { id: onlyConnector.id, label: connectorLabel?.text ?? "" } : null,
    targetIds,
  };
};

/** A number as shown in a field: at most two decimals, no trailing zeros, no "-0". */
export const formatNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

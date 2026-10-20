import { orderFramesBelowContents } from "@/core/frames/containment";
import { buildFrameIndex, frameDescendants } from "@/core/frames/frame-index";
import { withFrameContents } from "@/core/frames/payload";
import type { DocPatch } from "@/core/groups/patch";
import { storedOrderFromShapes } from "@/core/groups/order";
import { expandOffsets, unitBoxes, type Offset } from "@/core/groups/units";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  alignOffsets,
  distributeOffsets,
  reorder,
  spacingOffsets,
  type AlignMode,
  type DistributeAxis,
  type ZMove,
} from "@/features/whiteboard/utils/arrange";
import { planShapeMoves, uniformOffsets, withInternalConnectors } from "@/features/whiteboard/utils/move-plan";
import { labelKeyOf } from "./connectors";
import { editableIds } from "./editable";
import type { CommandContext } from "./context";

/** A patch that updates exactly `changed`, or null when there is nothing to write. */
export const updatePatch = (changed: readonly DrawingElement[]): DocPatch | null =>
  changed.length === 0 ? null : { add: [], update: [...changed], remove: [] };

/**
 * Moves shapes by per-shape offsets, and re-routes the connectors that must follow, as one patch. Shapes
 * without an offset stay; a locked shape is never in `offsets` (callers filter), but is refused here too.
 */
export const planMoveByOffsets = (ctx: CommandContext, offsets: ReadonlyMap<string, Offset>): DocPatch | null => {
  const movable = new Set(editableIds(ctx, [...offsets.keys()]));
  const wanted = new Map([...offsets].filter(([id]) => movable.has(id)));
  // A frame carries what it owns by the same offset (a shape with an offset of its own keeps it).
  if (ctx.shapes.some((shape) => shape.type === "frame")) {
    const frames = buildFrameIndex(ctx.shapes);
    for (const [id, offset] of [...wanted]) {
      if (!frames.frames.has(id)) continue;
      for (const owned of editableIds(ctx, frameDescendants(frames, id))) if (!wanted.has(owned)) wanted.set(owned, offset);
    }
  }
  const moving = ctx.shapes.filter((shape) => wanted.has(shape.id));
  const origin = withInternalConnectors(moving, ctx.shapes);
  // A connector between two shapes that move by the same amount moves by that amount too, and so does its label.
  const all = new Map(wanted);
  const labelOffsets = new Map<string, Offset>();
  for (const shape of origin) {
    if (all.has(shape.id) || !isArrowElement(shape)) continue;
    const from = wanted.get(shape.startConnection?.elementId ?? "");
    const to = wanted.get(shape.endConnection?.elementId ?? "");
    if (!from || !to || from.dx !== to.dx || from.dy !== to.dy) continue;
    all.set(shape.id, from);
    labelOffsets.set(labelKeyOf(shape), from);
  }
  for (const shape of origin) {
    const offset = shape.ai?.role === "edge-label" ? labelOffsets.get(shape.ai.semanticId ?? "") : undefined;
    if (offset && !all.has(shape.id)) all.set(shape.id, offset);
  }
  return updatePatch(planShapeMoves(origin, all, ctx.reroute));
};

/** The selection (shapes and whole groups) moved by the same offset: nudge, drag, "move by". */
export const planMoveBy = (ctx: CommandContext, selected: readonly string[], dx: number, dy: number): DocPatch | null => {
  const shapes = ctx.shapes.filter((shape) => editableIds(ctx, selected).includes(shape.id));
  return planMoveByOffsets(ctx, uniformOffsets(shapes, dx, dy));
};

const boundsOfId = (ctx: CommandContext) => (id: string) => {
  const shape = ctx.index.shapes.get(id);
  return shape ? ctx.getBounds(shape) : null;
};

/** Align the selected units (a group counts as one box). Locked units are references that never move. */
export const planAlign = (ctx: CommandContext, selected: readonly string[], mode: AlignMode): DocPatch | null => {
  const units = unitBoxes(ctx.index, selected, boundsOfId(ctx));
  return planMoveByOffsets(ctx, expandOffsets(units, alignOffsets(units, mode)));
};

/** Equal gaps between three or more units along an axis; the outermost stay put. Locked units are left out. */
export const planDistribute = (ctx: CommandContext, selected: readonly string[], axis: DistributeAxis): DocPatch | null => {
  const units = unitBoxes(ctx.index, selected, boundsOfId(ctx)).filter((unit) => !unit.locked);
  return planMoveByOffsets(ctx, expandOffsets(units, distributeOffsets(units, axis)));
};

/** Exactly `gap` between neighbouring units along an axis, the first one staying where it is. */
export const planSpacing = (ctx: CommandContext, selected: readonly string[], axis: DistributeAxis, gap: number): DocPatch | null => {
  const units = unitBoxes(ctx.index, selected, boundsOfId(ctx)).filter((unit) => !unit.locked);
  return planMoveByOffsets(ctx, expandOffsets(units, spacingOffsets(units, axis, gap)));
};

/** Restack the unlocked selection (front, forward, backward, back). Group records keep their slots. */
export const planZOrder = (ctx: CommandContext, selected: readonly string[], move: ZMove): DocPatch | null => {
  const ids = editableIds(ctx, withFrameContents(ctx.shapes, editableIds(ctx, selected)));
  if (ids.length === 0) return null;
  let order = storedOrderFromShapes(ctx.stored, reorder(ctx.shapes.map((shape) => shape.id), new Set(ids), move));
  // A frame stays under what it owns: sending a shape to the back stops at its frame.
  const reordered = new Map(ctx.stored.map((item) => [item.id, item]));
  const fixed = orderFramesBelowContents(order.flatMap((id) => reordered.get(id) ?? []));
  if (fixed) order = fixed;
  const unchanged = order.every((id, i) => id === ctx.stored[i].id);
  return unchanged ? null : { add: [], update: [], remove: [], order };
};

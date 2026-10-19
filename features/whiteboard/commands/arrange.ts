import type { DocPatch } from "@/core/groups/patch";
import { storedOrderFromShapes } from "@/core/groups/order";
import { expandOffsets, unitBoxes, type Offset } from "@/core/groups/units";
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
import { planShapeMoves, uniformOffsets } from "@/features/whiteboard/utils/move-plan";
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
  const origin = ctx.shapes.filter((shape) => wanted.has(shape.id));
  return updatePatch(planShapeMoves(origin, wanted, ctx.reroute));
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
  const ids = editableIds(ctx, selected);
  if (ids.length === 0) return null;
  const order = storedOrderFromShapes(ctx.stored, reorder(ctx.shapes.map((shape) => shape.id), new Set(ids), move));
  const unchanged = order.every((id, i) => id === ctx.stored[i].id);
  return unchanged ? null : { add: [], update: [], remove: [], order };
};

import { attachableGroupIds, collectCopyGroups, regroupClones } from "@/core/groups/clone";
import type { DocPatch } from "@/core/groups/patch";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { cloneElements, collectCopySet } from "@/features/whiteboard/utils/arrange";
import type { CommandContext } from "./context";

/** Distance a pasted or duplicated copy is offset from its source, per paste. */
export const PASTE_STEP = 24;

export interface InsertPlan {
  patch: DocPatch;
  /** The new shapes, to leave selected. */
  selection: string[];
  /** Original id -> copy id, for every shape that was copied. */
  idMap: Map<string, string>;
}

/**
 * Copies of `source` (and of the groups they belonged to) as new elements, offset by `step` pastes.
 * Connectors between copied shapes are re-pointed at the copies; generation identity is dropped, so a
 * copy never collides with the diagram it came from.
 */
export const planInsertCopies = (
  ctx: CommandContext,
  source: readonly DrawingElement[],
  groups: ReturnType<typeof collectCopyGroups>,
  step: number,
): InsertPlan => {
  const offset = { dx: PASTE_STEP * step, dy: PASTE_STEP * step };
  const clones = cloneElements([...source], offset, ctx.newId);
  const regrouped = regroupClones([...source], clones, groups, ctx.newId, attachableGroupIds(ctx.index));
  const idMap = new Map(source.map((shape, i) => [shape.id, regrouped.shapes[i]?.id ?? clones[i].id]));
  return {
    patch: { add: [...regrouped.groups, ...regrouped.shapes], update: [], remove: [] },
    selection: regrouped.shapes.map((shape) => shape.id),
    idMap,
  };
};

/** The shapes `selected` stands for, with the connectors and labels that belong to them, as a copy source. */
export const copySourceOf = (ctx: CommandContext, selected: ReadonlySet<string>) => {
  const shapes = collectCopySet([...ctx.shapes], selected);
  return { shapes, groups: collectCopyGroups(ctx.stored, new Set(shapes.map((shape) => shape.id))) };
};

/** Duplicate the selection one step to the lower right. Null when nothing is selected. */
export const planDuplicate = (ctx: CommandContext, selected: ReadonlySet<string>, step = 1): InsertPlan | null => {
  const { shapes, groups } = copySourceOf(ctx, selected);
  return shapes.length === 0 ? null : planInsertCopies(ctx, shapes, groups, step);
};


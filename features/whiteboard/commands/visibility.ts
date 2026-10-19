import { ancestorsOf, isEffectivelyLocked, selectionUnits } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import { isHiddenByFlag } from "@/core/groups/visibility";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import type { CommandContext } from "./context";

const withHidden = (element: StoredElement, hidden: boolean): StoredElement => ({ ...element, hidden: hidden ? true : undefined }) as StoredElement;

/**
 * Hide the selected units (a group hides as one). A locked unit is not edited, so it is not hidden;
 * what is already hidden, directly or through a group, is left as it is. Null when nothing changes.
 */
export const planHide = (ctx: CommandContext, selected: readonly string[]): DocPatch | null => {
  const units = selectionUnits(ctx.index, selected).filter((unit) => !isEffectivelyLocked(ctx.index, unit) && !isHiddenByFlag(ctx.index, unit));
  const update = units.flatMap((unit) => {
    const element = ctx.index.shapes.get(unit) ?? ctx.index.groups.get(unit);
    return element ? [withHidden(element, true)] : [];
  });
  return update.length === 0 ? null : { add: [], update, remove: [] };
};

/**
 * Show the selected units: the flag is cleared on each unit, on everything inside it and on any hidden
 * group around it, so what the user asked to see really is visible afterwards (the same rule as unlocking).
 */
export const planShow = (ctx: CommandContext, selected: readonly string[]): DocPatch | null => {
  const targets = new Map<string, StoredElement>();
  const note = (id: string) => {
    const element = ctx.index.shapes.get(id) ?? ctx.index.groups.get(id);
    if (element && element.hidden === true) targets.set(id, element);
  };
  for (const unit of selectionUnits(ctx.index, selected)) {
    note(unit);
    for (const leaf of ctx.index.leavesOf.get(unit) ?? []) note(leaf);
    for (const group of ctx.index.groups.keys()) if (ancestorsOf(ctx.index, group).includes(unit)) note(group);
    for (const ancestor of ancestorsOf(ctx.index, unit)) note(ancestor);
  }
  const update = [...targets.values()].map((element) => withHidden(element, false));
  return update.length === 0 ? null : { add: [], update, remove: [] };
};

/** Show everything that is hidden. */
export const planShowAll = (ctx: CommandContext): DocPatch | null => {
  const update = ctx.stored.filter((item) => item.hidden === true).map((item) => withHidden(item, false));
  return update.length === 0 ? null : { add: [], update, remove: [] };
};

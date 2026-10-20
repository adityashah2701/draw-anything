import { withFrameContents } from "@/core/frames/payload";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import { planDelete, withPrunedGroups } from "@/core/groups/group-commands";
import type { DocPatch } from "@/core/groups/patch";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { labelOf } from "./connectors";
import type { CommandContext } from "./context";

/**
 * Delete shapes (the Delete key, the eraser, cut and the AI's `delete_elements`): the connectors attached
 * to them go too, as does everything inside a deleted frame, so do the labels of every connector that goes, and every group left empty. Locked
 * shapes are never removed. Null when nothing can be deleted.
 */
export const planRemove = (ctx: CommandContext, ids: readonly string[]): DocPatch | null => {
  // Deleting a frame deletes what it owns; release the contents first (core/frames deleteFrame) to keep them.
  const base = planDelete(ctx.stored, withFrameContents(ctx.shapes, ids));
  if (!base) return null;
  const gone = new Set(base.remove);
  const labels: string[] = [];
  for (const id of base.remove) {
    const shape = ctx.index.shapes.get(id);
    if (!shape || !isArrowElement(shape)) continue;
    const label = labelOf(ctx, shape);
    if (label && !gone.has(label.id) && !isEffectivelyLocked(ctx.index, label.id)) labels.push(label.id);
  }
  return labels.length === 0 ? base : withPrunedGroups(ctx.stored, { ...base, remove: [...base.remove, ...labels] });
};

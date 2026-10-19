import { isEffectivelyLocked, type GroupIndex } from "@/core/groups/group-index";

/** Ids of shapes that exist, are not locked (directly or through a group), and can therefore be edited. */
export const editableIds = (ctx: { index: GroupIndex }, ids: readonly string[]): string[] =>
  ids.filter((id) => ctx.index.shapes.has(id) && !isEffectivelyLocked(ctx.index, id));

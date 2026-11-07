import { z } from "zod";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import { planSetLocked } from "@/core/groups/group-commands";
import { isHiddenByFlag } from "@/core/groups/visibility";
import { planHide, planShow, planShowAll } from "@/features/whiteboard/commands/visibility";
import { ToolError } from "../../errors";
import { expectedRevision, targetIds } from "../../schemas";
import type { ToolDefinition } from "../../types";
import { count, listIds, lockedSkips, resolveTargets } from "../helpers";

const idsOnly = z.object({ ids: targetIds, expected_revision: expectedRevision }).strict();

const lockTool = (name: "lock_elements" | "unlock_elements", lock: boolean): ToolDefinition<typeof idsOnly> => ({
  name,
  group: "edit",
  description: lock
    ? "Lock elements (or groups) so they cannot be moved or edited by anyone until unlocked. Hides nothing; they stay selectable."
    : "Unlock elements (or groups), including any group around them, so they can be edited again.",
  input: idsOnly,
  access: "write",
  run: ({ ids }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const patch = planSetLocked(env.ctx.stored, shapeIds, lock);
    const changed = patch?.update.map((item) => item.id) ?? [];
    return {
      summary: patch
        ? `${lock ? "Locked" : "Unlocked"} ${count(changed.length, "element")}: ${listIds(changed)}.`
        : `Already ${lock ? "locked" : "unlocked"}; nothing changed.`,
      data: { changed },
      patch,
    };
  },
});

export const lockElements = lockTool("lock_elements", true);
export const unlockElements = lockTool("unlock_elements", false);

export const hideElements: ToolDefinition<typeof idsOnly> = {
  name: "hide_elements",
  group: "edit",
  description:
    "Hide elements or groups from the canvas and exports without deleting them; connectors with a hidden end hide with it. Show them again with show_elements. Locked elements are not hidden.",
  input: idsOnly,
  access: "write",
  run: ({ ids }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const patch = planHide(env.ctx, shapeIds);
    const changed = patch?.update.map((item) => item.id) ?? [];
    const locked = shapeIds.filter((id) => isEffectivelyLocked(env.ctx.index, id) && !isHiddenByFlag(env.ctx.index, id));
    return {
      summary: patch
        ? `Hid ${count(changed.length, "item")}: ${listIds(changed)}.`
        : "Nothing to hide (already hidden or locked).",
      data: { changed },
      patch,
      skipped: lockedSkips(locked),
    };
  },
};

const showInput = z
  .object({
    ids: targetIds.optional(),
    all: z.boolean().optional().describe("Show everything that is hidden."),
    expected_revision: expectedRevision,
  })
  .strict();

export const showElements: ToolDefinition<typeof showInput> = {
  name: "show_elements",
  group: "edit",
  description: "Show hidden elements or groups again (or everything hidden with all: true). Nothing else changes.",
  input: showInput,
  access: "write",
  run: ({ ids, all }, env) => {
    if (!ids && !all) throw new ToolError("invalid_arguments", "Give `ids` or all: true.");
    const patch = all ? planShowAll(env.ctx) : planShow(env.ctx, resolveTargets(env, ids!).shapeIds);
    const changed = patch?.update.map((item) => item.id) ?? [];
    return {
      summary: patch ? `Showed ${count(changed.length, "item")}: ${listIds(changed)}.` : "Nothing was hidden; nothing changed.",
      data: { changed },
      patch,
    };
  },
};

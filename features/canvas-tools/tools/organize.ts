import { z } from "zod";
import { planRenameGroup, planUngroup } from "@/core/groups/group-commands";
import { expectedRevision, elementId, newElementId, targetIds } from "../schemas";
import { ToolError } from "../errors";
import type { ToolDefinition } from "../types";
import { count, listIds } from "./helpers";
import { groupElementsPatch } from "./create";

const groupInput = z
  .object({
    ids: targetIds.describe("At least two elements or groups to put in one group; \"@selection\" counts as its elements."),
    name: z.string().min(1).max(80).optional(),
    id: newElementId.optional(),
    expected_revision: expectedRevision,
  })
  .strict();

export const groupElements: ToolDefinition<typeof groupInput> = {
  name: "group_elements",
  group: "organize",
  description: "Group two or more elements (or groups) so they move, lock, hide and copy as one. Nothing is moved; connectors between them and to the outside keep working. Nested under their common parent group if they share one. Locked elements are refused.",
  input: groupInput,
  access: "write",
  run: ({ ids, name, id }, env) => {
    const { patch, groupId, selection } = groupElementsPatch(env, ids, { id, name });
    return { summary: `Grouped ${count(selection.length, "element")} into ${groupId}${name ? ` ("${name}")` : ""}.`, data: { id: groupId, members: selection }, patch, selection };
  },
};

const ungroupInput = z.object({ ids: z.array(elementId).min(1).max(100).describe("Group ids."), expected_revision: expectedRevision }).strict();

export const ungroupElements: ToolDefinition<typeof ungroupInput> = {
  name: "ungroup_elements",
  group: "organize",
  description: "Dissolve groups one level: their members move up into the parent group (or the top level) with positions, ids, order and connectors unchanged. Locked groups are refused.",
  input: ungroupInput,
  access: "write",
  run: ({ ids }, env) => {
    const { ctx } = env;
    const unknown = ids.filter((id) => !ctx.index.groups.has(id));
    if (unknown.length > 0) {
      const shapes = unknown.filter((id) => ctx.index.shapes.has(id));
      throw new ToolError(shapes.length === unknown.length ? "invalid_state" : "not_found", shapes.length > 0 ? `${listIds(shapes)} ${shapes.length === 1 ? "is a shape, not a group" : "are shapes, not groups"}. Pass group ids (see get_document_state).` : `No group with id ${listIds(unknown)}.`, { ids: unknown });
    }
    const members = ids.flatMap((id) => ctx.index.leavesOf.get(id) ?? []);
    const plan = planUngroup(ctx.stored, members);
    const wanted = new Set(ids);
    if (!plan || !plan.groups.some((id) => wanted.has(id))) throw new ToolError("locked", "Those groups are locked. Unlock them first (unlock_elements).", { ids });
    return { summary: `Ungrouped ${count(plan.groups.length, "group")}: ${listIds(plan.groups)}. ${count(plan.selection.length, "element")} kept in place.`, data: { dissolved: plan.groups, members: plan.selection }, patch: plan.patch, selection: plan.selection };
  },
};

const renameInput = z.object({ id: elementId.describe("The group."), name: z.string().max(80).describe("The new name; empty resets it to \"Group\"."), expected_revision: expectedRevision }).strict();

export const renameGroup: ToolDefinition<typeof renameInput> = {
  name: "rename_group",
  group: "organize",
  description: "Rename a group. Only its name changes.",
  input: renameInput,
  access: "write",
  run: ({ id, name }, env) => {
    if (env.ctx.index.shapes.get(id)?.type === "frame") throw new ToolError("invalid_state", `"${id}" is a frame, not a group. Rename it with update_frame {id, title}.`, { ids: [id] });
    if (!env.ctx.index.groups.has(id)) throw new ToolError(env.ctx.index.shapes.has(id) ? "invalid_state" : "not_found", env.ctx.index.shapes.has(id) ? `"${id}" is a shape, not a group.` : `No group with id "${id}".`, { ids: [id] });
    const patch = planRenameGroup(env.ctx.stored, id, name);
    return { summary: patch ? `Renamed ${id} to "${name.trim() || "Group"}".` : "The group already has that name; nothing changed.", data: { id, name: name.trim().slice(0, 80) || "Group" }, patch };
  },
};

export const ORGANIZE_TOOLS = [groupElements, ungroupElements, renameGroup] as const;

import { z } from "zod";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { planRemove } from "@/features/whiteboard/commands/remove";
import { ToolError } from "../../errors";
import { expectedRevision, targetIds } from "../../schemas";
import type { ToolDefinition } from "../../types";
import { count } from "../helpers";
import { editableTargets, skipLocked } from "./common";

/** At or above this many removed elements (or half the board) a human must approve. */
const BULK_DELETE = 25;

const deleteInput = z
  .object({
    ids: targetIds,
    skip_locked: skipLocked,
    confirm: z
      .literal(true)
      .optional()
      .describe(`Required (and the person is asked) when ${BULK_DELETE} or more elements, or more than half the board, would go.`),
    expected_revision: expectedRevision,
  })
  .strict();

export const deleteElements: ToolDefinition<typeof deleteInput> = {
  name: "delete_elements",
  group: "edit",
  description:
    "Delete elements. Connectors attached to a deleted element and their labels are deleted with it (listed in the result); everything else, including the elements at the other end of those connectors, is kept. Locked elements are refused. Large deletions need confirmation.",
  input: deleteInput,
  access: "write",
  strictRevision: true,
  run: async ({ ids, skip_locked, confirm }, env) => {
    const { ctx } = env;
    const { editable, skipped } = editableTargets(env, ids, skip_locked);
    const patch = planRemove(ctx, editable);
    if (!patch) return { summary: "Nothing to delete.", data: { removed: [] }, skipped };
    const removedShapes = patch.remove.filter((id) => ctx.index.shapes.has(id));
    const requested = new Set(editable);
    const connectors = removedShapes.filter((id) => !requested.has(id) && isArrowElement(ctx.index.shapes.get(id)!));
    const labels = removedShapes.filter((id) => !requested.has(id) && ctx.index.shapes.get(id)?.ai?.role === "edge-label");
    const big = removedShapes.length >= BULK_DELETE || (removedShapes.length >= 6 && removedShapes.length > ctx.shapes.length / 2);
    if (big) {
      if (!confirm)
        throw new ToolError(
          "confirmation_required",
          `This would delete ${removedShapes.length} of ${ctx.shapes.length} elements. Repeat the call with confirm: true if that is what was asked for.`,
          { details: { wouldRemove: removedShapes.length } },
        );
      await env.confirm(`Delete ${removedShapes.length} elements?`);
    }
    return {
      summary: `Deleted ${count(editable.length, "element")}${connectors.length > 0 ? ` and ${count(connectors.length, "attached connector")}` : ""}${labels.length > 0 ? ` (+${count(labels.length, "label")})` : ""}. Other elements were kept.`,
      data: { removed: patch.remove, requested: editable, connectorsRemoved: connectors, labelsRemoved: labels },
      patch,
      skipped,
    };
  },
};

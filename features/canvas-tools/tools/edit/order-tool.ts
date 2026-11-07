import { z } from "zod";
import { planZOrder } from "@/features/whiteboard/commands/arrange";
import { expectedRevision, targetIds } from "../../schemas";
import type { ToolDefinition } from "../../types";
import { count } from "../helpers";
import { editableTargets, skipLocked } from "./common";

const orderInput = z
  .object({
    ids: targetIds,
    move: z.enum(["front", "forward", "backward", "back"]).describe("front/back: to the very top/bottom; forward/backward: one step."),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const reorderElements: ToolDefinition<typeof orderInput> = {
  name: "reorder_elements",
  group: "edit",
  description: "Change the stacking order (what is drawn on top): bring to front, send to back, or one step forward/backward.",
  input: orderInput,
  access: "write",
  run: ({ ids, move, skip_locked }, env) => {
    const { editable, skipped } = editableTargets(env, ids, skip_locked);
    const patch = planZOrder(env.ctx, editable, move);
    return {
      summary: patch
        ? `Moved ${count(editable.length, "element")} ${move === "front" ? "to the front" : move === "back" ? "to the back" : move}.`
        : "Already in that position; nothing changed.",
      data: { move },
      patch,
      skipped,
    };
  },
};

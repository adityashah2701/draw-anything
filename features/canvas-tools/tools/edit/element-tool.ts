import { z } from "zod";
import type { DocPatch } from "@/core/groups/patch";
import { ToolError } from "../../errors";
import { expectedRevision, label, targetIds } from "../../schemas";
import type { ToolDefinition } from "../../types";
import { count, deriveContext, listIds, mergePatches } from "../helpers";
import {
  applyStyle,
  editableTargets,
  fontSize,
  fontWeight,
  skipLocked,
  styleFields,
  toStyleChange,
  updatePatch,
} from "./common";
import { planText } from "./label-tool";

const elementInput = z
  .object({
    ids: targetIds,
    text: label.optional(),
    ...styleFields,
    font_size: fontSize.optional(),
    font_weight: fontWeight.optional(),
    font_style: z.enum(["normal", "italic"]).optional(),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const updateElement: ToolDefinition<typeof elementInput> = {
  name: "update_element",
  group: "edit",
  description:
    "Change several properties of elements at once: text/label, colours, fill, stroke width, opacity, corner radius, font. One undo step. For position, size, rotation, icons and connectors use the dedicated tools.",
  input: elementInput,
  access: "write",
  run: (input, env) => {
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    let patch: DocPatch | null = null;
    const skipped = [...locked];
    const changed = new Set<string>();
    if (input.text !== undefined) {
      const planned = planText(env, editable, input.text);
      skipped.push(...planned.skipped);
      patch = updatePatch(planned.changed);
      planned.changed.forEach((c) => changed.add(c.id));
    }
    const change = toStyleChange(input);
    if (Object.keys(change).length > 0) {
      const base = patch ? deriveContext(env, patch) : env.ctx;
      const styled = applyStyle({ ...env, ctx: base }, editable, change);
      patch = patch ? mergePatches(patch, styled.patch ?? { add: [], update: [], remove: [] }) : styled.patch;
      styled.changed.forEach((id) => changed.add(id));
      skipped.push(...styled.skipped);
    }
    if (input.text === undefined && Object.keys(change).length === 0)
      throw new ToolError("invalid_arguments", "Give at least one property to change.");
    return {
      summary:
        changed.size === 0
          ? "Nothing needed changing."
          : `Updated ${count(changed.size, "element")}: ${listIds([...changed])}.`,
      data: { changed: [...changed] },
      patch,
      skipped,
    };
  },
};

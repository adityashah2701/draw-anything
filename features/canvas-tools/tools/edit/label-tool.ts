import { z } from "zod";
import type { DocPatch } from "@/core/groups/patch";
import { supportsStyle, planStyle } from "@/features/whiteboard/commands/style";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../../errors";
import { color, expectedRevision, label, targetIds } from "../../schemas";
import type { ToolDefinition, ToolEnv, ToolRun } from "../../types";
import { canHoldLabel, count, deriveContext, listIds, mergePatches } from "../helpers";
import {
  editableTargets,
  fontSize,
  fontWeight,
  normalizeText,
  skipLocked,
  toStyleChange,
  updatePatch,
} from "./common";

/** New text for each target: a text element's content or a shape's label. */
export const planText = (
  env: ToolEnv,
  editable: readonly string[],
  text: string,
): { changed: DrawingElement[]; skipped: Array<{ id: string; reason: string }> } => {
  const changed: DrawingElement[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const next = normalizeText(text);
  for (const id of editable) {
    const shape = env.ctx.index.shapes.get(id)!;
    if (shape.ai?.role === "edge-label") {
      skipped.push({ id, reason: "this is a connector label; use update_connector_label" });
    } else if (shape.type === "text") {
      if (next.trim() === "")
        throw new ToolError("invalid_arguments", `Text "${id}" cannot be emptied; delete it instead (delete_elements).`, {
          ids: [id],
        });
      if ((shape.text ?? "") !== next) changed.push({ ...shape, text: next });
    } else if (canHoldLabel(shape)) {
      if ((shape.label ?? "") !== next) changed.push({ ...shape, label: next });
    } else {
      skipped.push({ id, reason: `a ${shape.type} has no text` });
    }
  }
  return { changed, skipped };
};

export const textInput = z
  .object({
    ids: targetIds,
    text: label.optional().describe("The new text (a text element's content, or a shape / node label). Use \\n for line breaks; empty clears a shape's label."),
    font_size: fontSize.optional(),
    font_weight: fontWeight.optional(),
    font_style: z.enum(["normal", "italic"]).optional(),
    color: color.optional().describe("Text colour."),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const runTextEdit = (env: ToolEnv, input: z.infer<typeof textInput>): ToolRun => {
  const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
  const typography = toStyleChange({
    font_size: input.font_size,
    font_weight: input.font_weight,
    font_style: input.font_style,
    color: input.color,
  });
  if (input.text === undefined && Object.keys(typography).length === 0)
    throw new ToolError("invalid_arguments", "Give `text` or a font property to change.");
  let patch: DocPatch | null = null;
  const skipped = [...locked];
  let changedIds: string[] = [];
  if (input.text !== undefined) {
    const planned = planText(env, editable, input.text);
    skipped.push(...planned.skipped);
    if (planned.changed.length === 0 && planned.skipped.length === editable.length)
      throw new ToolError("unsupported", `${planned.skipped[0].reason}.`, { ids: planned.skipped.map((s) => s.id) });
    patch = updatePatch(planned.changed);
    changedIds = planned.changed.map((c) => c.id);
  }
  if (Object.keys(typography).length > 0) {
    const base = patch ? deriveContext(env, patch) : env.ctx;
    const textual = editable.filter(
      (id) => !skipped.some((s) => s.id === id && s.reason !== "locked") && supportsStyle(base.index.shapes.get(id)!, "fontSize"),
    );
    if (textual.length === 0) throw new ToolError("unsupported", "None of the targets has text to style.");
    const styled = planStyle(base, textual, typography, { strict: true });
    patch = patch ? mergePatches(patch, styled.patch ?? { add: [], update: [], remove: [] }) : styled.patch;
    changedIds = [...new Set([...changedIds, ...styled.changed])];
  }
  return {
    summary:
      changedIds.length === 0
        ? "The text was already like that; nothing changed."
        : `Updated ${count(changedIds.length, "text element")}: ${listIds(changedIds)}.`,
    data: { changed: changedIds },
    patch,
    skipped,
  };
};

export const updateText: ToolDefinition<typeof textInput> = {
  name: "update_text",
  group: "edit",
  description:
    "Change the text of text elements and the labels of shapes and nodes (multi-line allowed), and optionally their font size, weight, style and colour. Connector labels use update_connector_label.",
  input: textInput,
  access: "write",
  run: (input, env) => runTextEdit(env, input),
};

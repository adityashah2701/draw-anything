import { z } from "zod";
import { unionBounds } from "@/core/geometry/box";
import { unitBoxes } from "@/core/groups/units";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { planMoveBy } from "@/features/whiteboard/commands/arrange";
import { planFrameEdit, planRotateBy, planSetRotation } from "@/features/whiteboard/utils/inspector-edit";
import { readInspector } from "@/features/whiteboard/utils/inspector-model";
import { ToolError } from "../../errors";
import { coordinate, expectedRevision, length, targetIds } from "../../schemas";
import type { ToolDefinition, ToolEnv } from "../../types";
import { count, deriveContext, listIds, settleConnectors } from "../helpers";
import { editableTargets, skipLocked, updatePatch } from "./common";

// ── move_elements ─────────────────────────────────────────────────────────────

const moveInput = z
  .object({
    ids: targetIds,
    dx: z.number().finite().min(-100_000).max(100_000).optional().describe("Move right by this much (negative = left)."),
    dy: z.number().finite().min(-100_000).max(100_000).optional().describe("Move down by this much (negative = up)."),
    x: coordinate.optional().describe("Absolute: put the left edge of the whole selection here."),
    y: coordinate.optional().describe("Absolute: put the top edge of the whole selection here."),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const moveElements: ToolDefinition<typeof moveInput> = {
  name: "move_elements",
  group: "edit",
  description:
    "Move elements together by (dx, dy), or to an absolute x/y of their combined box. Groups move as one; connectors attached to moved elements follow. Locked elements are refused.",
  input: moveInput,
  access: "write",
  run: (input, env) => {
    const relative = input.dx !== undefined || input.dy !== undefined;
    const absolute = input.x !== undefined || input.y !== undefined;
    if (relative === absolute)
      throw new ToolError("invalid_arguments", "Give either dx/dy (relative) or x/y (absolute), not both and not neither.");
    const { ctx } = env;
    const { editable, skipped } = editableTargets(env, input.ids, input.skip_locked);
    const units = unitBoxes(ctx.index, editable, (id) => {
      const shape = ctx.index.shapes.get(id);
      return shape ? ctx.getBounds(shape) : null;
    });
    const box = unionBounds(units.map((unit) => unit.bounds));
    if (!box) throw new ToolError("invalid_state", "The elements have no position to move.");
    const dx = relative ? (input.dx ?? 0) : input.x !== undefined ? input.x - box.minX : 0;
    const dy = relative ? (input.dy ?? 0) : input.y !== undefined ? input.y - box.minY : 0;
    if (dx === 0 && dy === 0)
      return { summary: "Already there; nothing moved.", data: { x: Math.round(box.minX), y: Math.round(box.minY) }, skipped };
    const settled = settleConnectors(env, planMoveBy(ctx, editable, dx, dy));
    const patch = settled.patch;
    return {
      warnings: settled.warnings,
      summary: `Moved ${count(units.length, "item")} by (${Math.round(dx)}, ${Math.round(dy)}); now at (${Math.round(box.minX + dx)}, ${Math.round(box.minY + dy)}).`,
      data: {
        dx,
        dy,
        x: Math.round(box.minX + dx),
        y: Math.round(box.minY + dy),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
      patch,
      skipped,
    };
  },
};

// ── resize_element ────────────────────────────────────────────────────────────

const resizeInput = z
  .object({
    ids: targetIds,
    width: length.optional(),
    height: length.optional(),
    x: coordinate.optional().describe("Also move the left edge here."),
    y: coordinate.optional().describe("Also move the top edge here."),
    keep_aspect_ratio: z.boolean().optional().describe("With only width or only height given, scale the other to keep the proportions."),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const frameOf = (env: ToolEnv, ids: readonly string[]) => {
  const { ctx } = env;
  return readInspector(ctx.index, ids, (id) => {
    const shape = ctx.index.shapes.get(id);
    return shape ? ctx.getBounds(shape) : null;
  });
};

export const resizeElement: ToolDefinition<typeof resizeInput> = {
  name: "resize_element",
  group: "edit",
  description:
    "Resize an element (or a whole selection, scaled together) to a width and/or height, optionally keeping proportions or moving the top-left corner. Attached connectors are re-routed. Reports the size actually reached.",
  input: resizeInput,
  access: "write",
  run: (input, env) => {
    if (input.width === undefined && input.height === undefined && input.x === undefined && input.y === undefined)
      throw new ToolError("invalid_arguments", "Give width, height, x or y.");
    const { ctx } = env;
    const { editable, skipped } = editableTargets(env, input.ids, input.skip_locked);
    const model = frameOf(env, editable);
    if (!model?.frame) throw new ToolError("invalid_state", "The elements have no size to change.");
    const targets = model.targetIds.flatMap((id) => ctx.index.shapes.get(id) ?? []);
    const changed = planFrameEdit({
      targets,
      frame: model.frame,
      frameIsLocal: model.frameIsLocal,
      edit: { x: input.x, y: input.y, width: input.width, height: input.height },
      keepRatio: input.keep_aspect_ratio === true,
      getBounds: (shape) => ctx.getBounds(shape),
      reroute: ctx.reroute,
    });
    const patch = updatePatch(changed);
    if (!patch) return { summary: "Already that size; nothing changed.", data: { ...model.frame }, skipped };
    const after = frameOf({ ...env, ctx: deriveContext(env, patch) }, editable)?.frame;
    const warnings: string[] = [];
    if (after && input.width !== undefined && Math.abs(after.width - input.width) > 1)
      warnings.push(`The width came out ${Math.round(after.width)}, not ${input.width} (the smallest size the content allows).`);
    if (after && input.height !== undefined && Math.abs(after.height - input.height) > 1)
      warnings.push(`The height came out ${Math.round(after.height)}, not ${input.height} (the smallest size the content allows).`);
    return {
      summary: `Resized ${count(model.unitCount, "item")} to ${after ? `${Math.round(after.width)}x${Math.round(after.height)}` : "the new size"}.`,
      data: { before: model.frame, after: after ?? null },
      patch,
      skipped,
      warnings,
    };
  },
};

// ── rotate_elements ───────────────────────────────────────────────────────────

const rotateInput = z
  .object({
    ids: targetIds,
    degrees: z.number().finite().min(-360).max(360),
    mode: z
      .enum(["set", "by"])
      .optional()
      .describe(
        "set: the angle of one rotatable element (default for a single element); by: turn the selection by this many degrees about its centre.",
      ),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const rotateElements: ToolDefinition<typeof rotateInput> = {
  name: "rotate_elements",
  group: "edit",
  description:
    "Rotate elements clockwise: set one shape's angle, or turn a selection by some degrees about its centre. Connectors attached to rotated shapes follow.",
  input: rotateInput,
  access: "write",
  run: (input, env) => {
    const { ctx } = env;
    const { editable, skipped } = editableTargets(env, input.ids, input.skip_locked);
    const model = frameOf(env, editable);
    if (!model) throw new ToolError("invalid_state", "There is nothing to rotate.");
    if (model.rotation.mode === "none") throw new ToolError("unsupported", "These elements cannot be rotated.");
    if (!model.frame) throw new ToolError("invalid_state", "The elements have no box to rotate.");
    const mode = input.mode ?? (model.rotation.mode === "absolute" ? "set" : "by");
    let changed: DrawingElement[];
    if (mode === "set") {
      if (model.rotation.mode !== "absolute")
        throw new ToolError("invalid_arguments", 'mode "set" works on exactly one rotatable element; use mode "by" for a selection.');
      changed = planSetRotation(ctx.index.shapes.get(model.targetIds[0])!, input.degrees, ctx.reroute);
    } else {
      const targets = model.targetIds.flatMap((id) => ctx.index.shapes.get(id) ?? []);
      changed = planRotateBy(targets, model.frame, input.degrees, (shape) => ctx.getBounds(shape), ctx.reroute);
    }
    const patch = updatePatch(changed);
    return {
      summary: patch
        ? mode === "set"
          ? `Set rotation to ${input.degrees}°.`
          : `Rotated ${count(model.unitCount, "item")} by ${input.degrees}°.`
        : "Already at that angle; nothing changed.",
      data: { mode, degrees: input.degrees },
      patch,
      skipped,
    };
  },
};

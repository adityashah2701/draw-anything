import { z } from "zod";
import { unionBounds } from "@/core/geometry/box";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import { planSetLocked } from "@/core/groups/group-commands";
import type { DocPatch } from "@/core/groups/patch";
import { isHiddenByFlag } from "@/core/groups/visibility";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { CORNER_RADIUS_LIMITS, ICON_SIZE_LIMITS, type NodeStylePatch } from "@/core/shapes/semantic-node/style";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import { unitBoxes } from "@/core/groups/units";
import { planMoveBy, planZOrder } from "@/features/whiteboard/commands/arrange";
import { planHide, planShow, planShowAll } from "@/features/whiteboard/commands/visibility";
import { planRemove } from "@/features/whiteboard/commands/remove";
import { planStyle, supportsStyle, type StyleChange, type StyleKey } from "@/features/whiteboard/commands/style";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { planFrameEdit, planRotateBy, planSetRotation } from "@/features/whiteboard/utils/inspector-edit";
import { readInspector } from "@/features/whiteboard/utils/inspector-model";
import { planNodeStyle, planRemoveIcon, planReplaceIcon, planRestoreIcon, planTypography, planLabel, isSemanticNode } from "@/features/whiteboard/utils/semantic-node-edit";
import { ToolError } from "../errors";
import { color, coordinate, expectedRevision, fill, label, length, targetIds } from "../schemas";
import type { ToolDefinition, ToolEnv, ToolRun } from "../types";
import { count, deriveContext, listIds, lockedSkips, mergePatches, requireEditable, resolveIcon, resolveTargets } from "./helpers";

const strokeWidth = z.number().finite().min(0.5).max(24);
const opacity = z.number().finite().min(0).max(1).describe("0 invisible to 1 opaque.");
const fontSize = z.number().finite().min(6).max(200);
const fontWeight = z.enum(["400", "500", "600", "700", "800"]);
const skipLocked = z.boolean().optional().describe("Leave locked elements out instead of failing the call.");

const normalizeText = (value: string) => value.replace(/\r\n?/g, "\n");
const updatePatch = (changed: readonly DrawingElement[]): DocPatch | null => (changed.length === 0 ? null : { add: [], update: [...changed], remove: [] });

/** The editable shape ids behind `ids`, with locked ones either an error or skipped (and said so). */
const editableTargets = (env: ToolEnv, ids: readonly string[], skip: boolean | undefined) => {
  const { shapeIds } = resolveTargets(env, ids);
  const { editable, skipped } = requireEditable(env.ctx, shapeIds, { skipLocked: skip });
  if (editable.length === 0) throw new ToolError("locked", "Every target is locked, so nothing was changed.", { ids: shapeIds });
  return { shapeIds, editable, skipped };
};

// ── style ────────────────────────────────────────────────────────────────────

interface StyleInput {
  color?: string;
  fill?: string | null;
  stroke_width?: number;
  opacity?: number;
  corner_radius?: number;
  font_size?: number;
  font_weight?: string;
  font_style?: "normal" | "italic";
}

const toStyleChange = (input: StyleInput): StyleChange => ({
  ...(input.color !== undefined ? { color: input.color } : {}),
  ...(input.fill !== undefined ? { fill: input.fill } : {}),
  ...(input.stroke_width !== undefined ? { strokeWidth: input.stroke_width } : {}),
  ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
  ...(input.corner_radius !== undefined ? { cornerRadius: input.corner_radius } : {}),
  ...(input.font_size !== undefined ? { fontSize: input.font_size } : {}),
  ...(input.font_weight !== undefined ? { fontWeight: input.font_weight } : {}),
  ...(input.font_style !== undefined ? { fontStyle: input.font_style } : {}),
});

/**
 * Restyles with the editor's own command. A property an element cannot show leaves that element out and
 * is reported; a call where nothing could be applied is an error, never a quiet success.
 */
const applyStyle = (env: ToolEnv, editable: readonly string[], change: StyleChange) => {
  const keys = Object.keys(change) as StyleKey[];
  if (keys.length === 0) throw new ToolError("invalid_arguments", "Give at least one property to change.");
  const plan = planStyle(env.ctx, editable, change, { strict: true });
  const skipped = plan.unsupported.map(({ id, keys: bad }) => ({ id, reason: `a ${env.ctx.index.shapes.get(id)?.type ?? "element"} cannot take ${bad.join(", ")}` }));
  if (plan.changed.length === 0 && plan.unsupported.length > 0) {
    throw new ToolError("unsupported", `None of the ${count(editable.length, "element")} can take ${[...new Set(plan.unsupported.flatMap((u) => u.keys))].join(", ")}. ${skipped[0].reason}.`, { ids: plan.unsupported.map((u) => u.id) });
  }
  return { patch: plan.patch, changed: plan.changed, skipped };
};

const styleFields = {
  color: color.optional().describe("Outline / line / text colour."),
  fill: fill.optional(),
  stroke_width: strokeWidth.optional(),
  opacity: opacity.optional(),
  corner_radius: z.number().finite().min(0).max(CORNER_RADIUS_LIMITS.max * 2).optional().describe("Rectangles and semantic nodes; 0 is square."),
};

const styleInput = z.object({ ids: targetIds, ...styleFields, skip_locked: skipLocked, expected_revision: expectedRevision }).strict();

export const updateShapeStyle: ToolDefinition<typeof styleInput> = {
  name: "update_shape_style",
  group: "edit",
  description: "Change the look of elements: outline colour, fill (null = none), stroke width, opacity, corner radius. Only the given properties change; an element that cannot show a property is reported and left alone. Locked elements are refused.",
  input: styleInput,
  access: "write",
  run: (input, env) => {
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    const { patch, changed, skipped } = applyStyle(env, editable, toStyleChange(input));
    return {
      summary: changed.length === 0 ? "Already styled that way; nothing changed." : `Restyled ${count(changed.length, "element")}: ${listIds(changed)}.`,
      data: { changed },
      patch,
      skipped: [...locked, ...skipped],
    };
  },
};

// ── text ─────────────────────────────────────────────────────────────────────

const isLabelable = (shape: DrawingElement) => Boolean(getShapeDefinition(shape.type)?.labelConfig) && !isArrowElement(shape);

/** New text for each target: a text element's content or a shape's label. */
const planText = (env: ToolEnv, editable: readonly string[], text: string): { changed: DrawingElement[]; skipped: Array<{ id: string; reason: string }> } => {
  const changed: DrawingElement[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const next = normalizeText(text);
  for (const id of editable) {
    const shape = env.ctx.index.shapes.get(id)!;
    if (shape.ai?.role === "edge-label") {
      skipped.push({ id, reason: "this is a connector label; use update_connector_label" });
    } else if (shape.type === "text") {
      if (next.trim() === "") throw new ToolError("invalid_arguments", `Text "${id}" cannot be emptied; delete it instead (delete_elements).`, { ids: [id] });
      if ((shape.text ?? "") !== next) changed.push({ ...shape, text: next });
    } else if (isLabelable(shape)) {
      if ((shape.label ?? "") !== next) changed.push({ ...shape, label: next });
    } else {
      skipped.push({ id, reason: `a ${shape.type} has no text` });
    }
  }
  return { changed, skipped };
};

const textInput = z
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

const runTextEdit = (env: ToolEnv, input: z.infer<typeof textInput>): ToolRun => {
  const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
  const typography = toStyleChange({ font_size: input.font_size, font_weight: input.font_weight, font_style: input.font_style, color: input.color });
  if (input.text === undefined && Object.keys(typography).length === 0) throw new ToolError("invalid_arguments", "Give `text` or a font property to change.");
  let patch: DocPatch | null = null;
  const skipped = [...locked];
  let changedIds: string[] = [];
  if (input.text !== undefined) {
    const planned = planText(env, editable, input.text);
    skipped.push(...planned.skipped);
    if (planned.changed.length === 0 && planned.skipped.length === editable.length) throw new ToolError("unsupported", `${planned.skipped[0].reason}.`, { ids: planned.skipped.map((s) => s.id) });
    patch = updatePatch(planned.changed);
    changedIds = planned.changed.map((c) => c.id);
  }
  if (Object.keys(typography).length > 0) {
    const base = patch ? deriveContext(env, patch) : env.ctx;
    const textual = editable.filter((id) => !skipped.some((s) => s.id === id && s.reason !== "locked") && supportsStyle(base.index.shapes.get(id)!, "fontSize"));
    if (textual.length === 0) throw new ToolError("unsupported", "None of the targets has text to style.");
    const styled = planStyle(base, textual, typography, { strict: true });
    patch = patch ? mergePatches(patch, styled.patch ?? { add: [], update: [], remove: [] }) : styled.patch;
    changedIds = [...new Set([...changedIds, ...styled.changed])];
  }
  return {
    summary: changedIds.length === 0 ? "The text was already like that; nothing changed." : `Updated ${count(changedIds.length, "text element")}: ${listIds(changedIds)}.`,
    data: { changed: changedIds },
    patch,
    skipped,
  };
};

export const updateText: ToolDefinition<typeof textInput> = {
  name: "update_text",
  group: "edit",
  description: "Change the text of text elements and the labels of shapes and nodes (multi-line allowed), and optionally their font size, weight, style and colour. Connector labels use update_connector_label.",
  input: textInput,
  access: "write",
  run: (input, env) => runTextEdit(env, input),
};

// ── update_element (any combination) ────────────────────────────────────────────

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
  description: "Change several properties of elements at once: text/label, colours, fill, stroke width, opacity, corner radius, font. One undo step. For position, size, rotation, icons and connectors use the dedicated tools.",
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
    if (input.text === undefined && Object.keys(change).length === 0) throw new ToolError("invalid_arguments", "Give at least one property to change.");
    return { summary: changed.size === 0 ? "Nothing needed changing." : `Updated ${count(changed.size, "element")}: ${listIds([...changed])}.`, data: { changed: [...changed] }, patch, skipped };
  },
};

// ── icons ────────────────────────────────────────────────────────────────────

const iconInput = z
  .object({
    ids: targetIds,
    icon: z.string().min(1).max(60).optional().describe("Icon id or name to show (see search_icons)."),
    action: z.enum(["replace", "remove", "restore"]).optional().describe("replace (needs `icon`), remove (hide the icon; label takes the node), restore (back to the original icon, visible)."),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const updateIcon: ToolDefinition<typeof iconInput> = {
  name: "update_icon",
  group: "edit",
  description: "Change the icon of semantic nodes and standalone icons: replace it with another registry icon, hide it, or restore the original. The label, size, colour and connectors are untouched.",
  input: iconInput,
  access: "write",
  run: (input, env) => {
    const action = input.action ?? (input.icon ? "replace" : undefined);
    if (!action) throw new ToolError("invalid_arguments", "Give `icon` to replace the icon, or `action`: remove or restore.");
    if (action === "replace" && !input.icon) throw new ToolError("invalid_arguments", "`icon` is required to replace an icon.");
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    const shapes = editable.map((id) => env.ctx.index.shapes.get(id)!);
    const bad = shapes.filter((shape) => !isSemanticNode(shape) && !(shape.type === "icon" && action === "replace"));
    if (bad.length > 0 && bad.length === shapes.length) {
      throw new ToolError("unsupported", `Icons can only be changed on semantic nodes${action === "replace" ? " and icon elements" : ""}; ${bad.slice(0, 4).map((s) => `${s.id} is a ${s.type}`).join(", ")}.`, { ids: bad.map((s) => s.id) });
    }
    const def = action === "replace" ? resolveIcon(input.icon!) : undefined;
    const nodes = shapes.filter(isSemanticNode);
    const standalone = shapes.filter((shape) => shape.type === "icon");
    const changed: DrawingElement[] =
      action === "replace" ? [...planReplaceIcon(nodes, def!), ...standalone.flatMap((shape) => (shape.ai?.icon === def!.id && shape.ai.customIcon === undefined ? [] : [{ ...shape, ai: { ...(shape.ai ?? {}), icon: def!.id, customIcon: undefined } } as DrawingElement]))]
        : action === "remove" ? planRemoveIcon(nodes) : planRestoreIcon(nodes);
    return {
      summary: changed.length === 0 ? `Nothing to change (${action}).` : `${action === "replace" ? `Set icon ${def!.id}` : action === "remove" ? "Hid the icon" : "Restored the icon"} on ${count(changed.length, "element")}: ${listIds(changed.map((c) => c.id))}.`,
      data: { changed: changed.map((c) => c.id), ...(def ? { icon: def.id } : {}) },
      patch: updatePatch(changed),
      skipped: [...locked, ...bad.map((s) => ({ id: s.id, reason: `a ${s.type} has no icon to ${action}` }))],
    };
  },
};

// ── semantic nodes ───────────────────────────────────────────────────────────

const RESETTABLE = ["icon_size", "icon_placement", "icon_color", "corner_radius"] as const;

const semanticInput = z
  .object({
    ids: targetIds,
    label: label.optional(),
    kind: z.string().min(1).max(40).regex(/^[a-z][a-z0-9-]*$/).optional().describe("The node's kind (service, database, queue...)."),
    icon: z.string().min(1).max(60).optional().describe("Replace the icon."),
    icon_visible: z.boolean().optional(),
    icon_size: z.number().finite().min(ICON_SIZE_LIMITS.min).max(ICON_SIZE_LIMITS.max).optional(),
    icon_placement: z.enum(["left", "top", "right"]).optional(),
    icon_color: color.optional(),
    reset: z.array(z.enum(RESETTABLE)).max(RESETTABLE.length).optional().describe("Presentation settings to put back to their defaults."),
    ...styleFields,
    font_size: fontSize.optional(),
    font_weight: fontWeight.optional(),
    font_style: z.enum(["normal", "italic"]).optional(),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const updateSemanticNode: ToolDefinition<typeof semanticInput> = {
  name: "update_semantic_node",
  group: "edit",
  description: "Edit diagram nodes: label, kind, icon (replace / show / hide), icon size, placement and colour, corner radius, fill, outline and font. Only the given properties change. Position and size use move_elements and resize_element.",
  input: semanticInput,
  access: "write",
  run: (input, env) => {
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    const nodes = editable.map((id) => env.ctx.index.shapes.get(id)!);
    const notNodes = nodes.filter((shape) => !isSemanticNode(shape));
    if (notNodes.length > 0) {
      throw new ToolError("unsupported", `update_semantic_node only edits semantic nodes; ${notNodes.slice(0, 4).map((s) => `${s.id} is a ${s.type}`).join(", ")}. Use update_element or update_shape_style for those.`, { ids: notNodes.map((s) => s.id) });
    }
    const steps: Array<(ctx: ToolEnv["ctx"]) => DrawingElement[]> = [];
    const pick = (ctx: ToolEnv["ctx"]) => editable.map((id) => ctx.index.shapes.get(id)!);
    if (input.label !== undefined) {
      const text = normalizeText(input.label);
      steps.push((ctx) => planLabel(pick(ctx), text));
    }
    if (input.icon !== undefined) {
      const def = resolveIcon(input.icon);
      steps.push((ctx) => planReplaceIcon(pick(ctx), def));
    }
    const style: NodeStylePatch = {};
    for (const key of input.reset ?? []) {
      if (key === "icon_size") style.iconSize = undefined;
      if (key === "icon_placement") style.iconPlacement = undefined;
      if (key === "icon_color") style.iconColor = undefined;
      if (key === "corner_radius") style.cornerRadius = undefined;
    }
    if (input.icon_size !== undefined) style.iconSize = input.icon_size;
    if (input.icon_placement !== undefined) style.iconPlacement = input.icon_placement;
    if (input.icon_color !== undefined) style.iconColor = input.icon_color;
    if (input.icon_visible !== undefined) style.iconHidden = input.icon_visible ? undefined : true;
    if (input.corner_radius !== undefined) style.cornerRadius = Math.min(input.corner_radius, CORNER_RADIUS_LIMITS.max);
    if (Object.keys(style).length > 0) steps.push((ctx) => planNodeStyle(pick(ctx), style));
    if (input.font_weight !== undefined || input.font_style !== undefined) {
      steps.push((ctx) => planTypography(pick(ctx), { fontWeight: input.font_weight, italic: input.font_style === undefined ? undefined : input.font_style === "italic" }));
    }
    if (input.kind !== undefined) {
      const kind = input.kind;
      steps.push((ctx) => pick(ctx).flatMap((node) => (node.ai?.semanticKind === kind ? [] : [{ ...node, ai: { ...(node.ai ?? {}), semanticKind: kind } } as DrawingElement])));
    }
    const change = toStyleChange({ color: input.color, fill: input.fill, stroke_width: input.stroke_width, opacity: input.opacity, font_size: input.font_size });
    const skipped = [...locked];
    if (Object.keys(change).length > 0) {
      steps.push((ctx) => {
        const plan = planStyle(ctx, editable, change, { strict: true });
        return plan.patch?.update.filter((item): item is DrawingElement => "points" in item) ?? [];
      });
    }
    if (steps.length === 0) throw new ToolError("invalid_arguments", "Give at least one property to change.");

    let patch: DocPatch | null = null;
    let ctx = env.ctx;
    for (const step of steps) {
      const changed = step(ctx);
      if (changed.length === 0) continue;
      const next: DocPatch = { add: [], update: changed, remove: [] };
      patch = patch ? mergePatches(patch, next) : next;
      ctx = deriveContext(env, patch);
    }
    const changedIds = patch?.update.map((item) => item.id) ?? [];
    return {
      summary: changedIds.length === 0 ? "The nodes already look like that; nothing changed." : `Updated ${count(changedIds.length, "node")}: ${listIds(changedIds)}.`,
      data: { changed: changedIds },
      patch,
      skipped,
    };
  },
};

// ── move / resize / rotate ────────────────────────────────────────────────────

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
  description: "Move elements together by (dx, dy), or to an absolute x/y of their combined box. Groups move as one; connectors attached to moved elements follow. Locked elements are refused.",
  input: moveInput,
  access: "write",
  run: (input, env) => {
    const relative = input.dx !== undefined || input.dy !== undefined;
    const absolute = input.x !== undefined || input.y !== undefined;
    if (relative === absolute) throw new ToolError("invalid_arguments", "Give either dx/dy (relative) or x/y (absolute), not both and not neither.");
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
    if (dx === 0 && dy === 0) return { summary: "Already there; nothing moved.", data: { x: Math.round(box.minX), y: Math.round(box.minY) }, skipped };
    const patch = planMoveBy(ctx, editable, dx, dy);
    return {
      summary: `Moved ${count(units.length, "item")} by (${Math.round(dx)}, ${Math.round(dy)}); now at (${Math.round(box.minX + dx)}, ${Math.round(box.minY + dy)}).`,
      data: { dx, dy, x: Math.round(box.minX + dx), y: Math.round(box.minY + dy), width: Math.round(box.width), height: Math.round(box.height) },
      patch,
      skipped,
    };
  },
};

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

const frameOf = (env: ToolEnv, ids: readonly string[]) => {
  const { ctx } = env;
  return readInspector(ctx.index, ids, (id) => {
    const shape = ctx.index.shapes.get(id);
    return shape ? ctx.getBounds(shape) : null;
  });
};

export const resizeElement: ToolDefinition<typeof resizeInput> = {
  name: "resize_element",
  group: "edit",
  description: "Resize an element (or a whole selection, scaled together) to a width and/or height, optionally keeping proportions or moving the top-left corner. Attached connectors are re-routed. Reports the size actually reached.",
  input: resizeInput,
  access: "write",
  run: (input, env) => {
    if (input.width === undefined && input.height === undefined && input.x === undefined && input.y === undefined) throw new ToolError("invalid_arguments", "Give width, height, x or y.");
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
    if (after && input.width !== undefined && Math.abs(after.width - input.width) > 1) warnings.push(`The width came out ${Math.round(after.width)}, not ${input.width} (the smallest size the content allows).`);
    if (after && input.height !== undefined && Math.abs(after.height - input.height) > 1) warnings.push(`The height came out ${Math.round(after.height)}, not ${input.height} (the smallest size the content allows).`);
    return {
      summary: `Resized ${count(model.unitCount, "item")} to ${after ? `${Math.round(after.width)}x${Math.round(after.height)}` : "the new size"}.`,
      data: { before: model.frame, after: after ?? null },
      patch,
      skipped,
      warnings,
    };
  },
};

const rotateInput = z
  .object({
    ids: targetIds,
    degrees: z.number().finite().min(-360).max(360),
    mode: z.enum(["set", "by"]).optional().describe("set: the angle of one rotatable element (default for a single element); by: turn the selection by this many degrees about its centre."),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const rotateElements: ToolDefinition<typeof rotateInput> = {
  name: "rotate_elements",
  group: "edit",
  description: "Rotate elements clockwise: set one shape's angle, or turn a selection by some degrees about its centre. Connectors attached to rotated shapes follow.",
  input: rotateInput,
  access: "write",
  run: (input, env) => {
    const { ctx } = env;
    const { editable, skipped } = editableTargets(env, input.ids, input.skip_locked);
    const model = frameOf(env, editable);
    if (!model?.frame) throw new ToolError("invalid_state", "The elements have no box to rotate.");
    if (model.rotation.mode === "none") throw new ToolError("unsupported", "These elements cannot be rotated.");
    const mode = input.mode ?? (model.rotation.mode === "absolute" ? "set" : "by");
    let changed: DrawingElement[];
    if (mode === "set") {
      if (model.rotation.mode !== "absolute") throw new ToolError("invalid_arguments", 'mode "set" works on exactly one rotatable element; use mode "by" for a selection.');
      changed = planSetRotation(ctx.index.shapes.get(model.targetIds[0])!, input.degrees, ctx.reroute);
    } else {
      const targets = model.targetIds.flatMap((id) => ctx.index.shapes.get(id) ?? []);
      changed = planRotateBy(targets, model.frame, input.degrees, (shape) => ctx.getBounds(shape), ctx.reroute);
    }
    const patch = updatePatch(changed);
    return {
      summary: patch ? (mode === "set" ? `Set rotation to ${input.degrees}°.` : `Rotated ${count(model.unitCount, "item")} by ${input.degrees}°.`) : "Already at that angle; nothing changed.",
      data: { mode, degrees: input.degrees },
      patch,
      skipped,
    };
  },
};

// ── lock / hide / order / delete ───────────────────────────────────────────────

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
    return { summary: patch ? `${lock ? "Locked" : "Unlocked"} ${count(changed.length, "element")}: ${listIds(changed)}.` : `Already ${lock ? "locked" : "unlocked"}; nothing changed.`, data: { changed }, patch };
  },
});

export const lockElements = lockTool("lock_elements", true);
export const unlockElements = lockTool("unlock_elements", false);

export const hideElements: ToolDefinition<typeof idsOnly> = {
  name: "hide_elements",
  group: "edit",
  description: "Hide elements or groups from the canvas and exports without deleting them; connectors with a hidden end hide with it. Show them again with show_elements. Locked elements are not hidden.",
  input: idsOnly,
  access: "write",
  run: ({ ids }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const patch = planHide(env.ctx, shapeIds);
    const changed = patch?.update.map((item) => item.id) ?? [];
    const locked = shapeIds.filter((id) => isEffectivelyLocked(env.ctx.index, id) && !isHiddenByFlag(env.ctx.index, id));
    return { summary: patch ? `Hid ${count(changed.length, "item")}: ${listIds(changed)}.` : "Nothing to hide (already hidden or locked).", data: { changed }, patch, skipped: lockedSkips(locked) };
  },
};

const showInput = z.object({ ids: targetIds.optional(), all: z.boolean().optional().describe("Show everything that is hidden."), expected_revision: expectedRevision }).strict();

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
    return { summary: patch ? `Showed ${count(changed.length, "item")}: ${listIds(changed)}.` : "Nothing was hidden; nothing changed.", data: { changed }, patch };
  },
};

const orderInput = z.object({ ids: targetIds, move: z.enum(["front", "forward", "backward", "back"]).describe("front/back: to the very top/bottom; forward/backward: one step."), skip_locked: skipLocked, expected_revision: expectedRevision }).strict();

export const reorderElements: ToolDefinition<typeof orderInput> = {
  name: "reorder_elements",
  group: "edit",
  description: "Change the stacking order (what is drawn on top): bring to front, send to back, or one step forward/backward.",
  input: orderInput,
  access: "write",
  run: ({ ids, move, skip_locked }, env) => {
    const { editable, skipped } = editableTargets(env, ids, skip_locked);
    const patch = planZOrder(env.ctx, editable, move);
    return { summary: patch ? `Moved ${count(editable.length, "element")} ${move === "front" ? "to the front" : move === "back" ? "to the back" : move}.` : "Already in that position; nothing changed.", data: { move }, patch, skipped };
  },
};

/** At or above this many removed elements (or half the board) a human must approve. */
const BULK_DELETE = 25;

const deleteInput = z
  .object({
    ids: targetIds,
    skip_locked: skipLocked,
    confirm: z.literal(true).optional().describe(`Required (and the person is asked) when ${BULK_DELETE} or more elements, or more than half the board, would go.`),
    expected_revision: expectedRevision,
  })
  .strict();

export const deleteElements: ToolDefinition<typeof deleteInput> = {
  name: "delete_elements",
  group: "edit",
  description: "Delete elements. Connectors attached to a deleted element and their labels are deleted with it (listed in the result); everything else, including the elements at the other end of those connectors, is kept. Locked elements are refused. Large deletions need confirmation.",
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
      if (!confirm) throw new ToolError("confirmation_required", `This would delete ${removedShapes.length} of ${ctx.shapes.length} elements. Repeat the call with confirm: true if that is what was asked for.`, { details: { wouldRemove: removedShapes.length } });
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

export const EDIT_TOOLS = [
  updateElement,
  updateText,
  updateIcon,
  updateSemanticNode,
  updateShapeStyle,
  moveElements,
  resizeElement,
  rotateElements,
  lockElements,
  unlockElements,
  hideElements,
  showElements,
  reorderElements,
  deleteElements,
] as const;


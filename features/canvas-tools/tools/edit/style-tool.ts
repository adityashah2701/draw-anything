import { z } from "zod";
import type { DocPatch } from "@/core/groups/patch";
import { getOutlineVariant, outlineVariantIds } from "@/core/shapes/outline/variants";
import { CORNER_RADIUS_LIMITS, ICON_SIZE_LIMITS, type NodeStylePatch } from "@/core/shapes/semantic-node/style";
import { planStyle } from "@/features/whiteboard/commands/style";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  isSemanticNode,
  planLabel,
  planNodeStyle,
  planRemoveIcon,
  planReplaceIcon,
  planRestoreIcon,
  planTypography,
} from "@/features/whiteboard/utils/semantic-node-edit";
import { ToolError } from "../../errors";
import { color, expectedRevision, label, targetIds } from "../../schemas";
import type { ToolDefinition, ToolEnv } from "../../types";
import { count, deriveContext, listIds, mergePatches, resolveIcon, settleConnectors } from "../helpers";
import {
  applyStyle,
  editableTargets,
  fontSize,
  fontWeight,
  normalizeText,
  skipLocked,
  styleFields,
  toStyleChange,
  updatePatch,
} from "./common";

// ── update_shape_style ────────────────────────────────────────────────────────

const styleInput = z
  .object({ ids: targetIds, ...styleFields, skip_locked: skipLocked, expected_revision: expectedRevision })
  .strict();

export const updateShapeStyle: ToolDefinition<typeof styleInput> = {
  name: "update_shape_style",
  group: "edit",
  description:
    "Change the look of elements: outline colour, fill (null = none), stroke width, opacity, corner radius. Only the given properties change; an element that cannot show a property is reported and left alone. Locked elements are refused.",
  input: styleInput,
  access: "write",
  run: (input, env) => {
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    const { patch, changed, skipped } = applyStyle(env, editable, toStyleChange(input));
    return {
      summary:
        changed.length === 0
          ? "Already styled that way; nothing changed."
          : `Restyled ${count(changed.length, "element")}: ${listIds(changed)}.`,
      data: { changed },
      patch,
      skipped: [...locked, ...skipped],
    };
  },
};

// ── change_shape ──────────────────────────────────────────────────────────────

const SHAPE_CHOICES = ["rectangle", "diamond", "ellipse", "pill", "triangle", "semantic-node"] as const;
const OUTLINE_IDS = outlineVariantIds() as [string, ...string[]];
const RESHAPABLE = new Set<string>([...SHAPE_CHOICES, "circle", "outline"]);

const shapeInput = z
  .object({
    ids: targetIds,
    shape: z
      .enum([...SHAPE_CHOICES, ...OUTLINE_IDS])
      .describe(
        "The new shape: diamond for decisions, pill for start/end, semantic-node for a labelled box with an icon, or an outline variant (cylinder for a database...).",
      ),
    skip_locked: skipLocked,
  })
  .strict();

export const changeShape: ToolDefinition<typeof shapeInput> = {
  name: "change_shape",
  group: "edit",
  description:
    "Change what shape nodes are drawn as (rectangle, diamond, ellipse, pill, triangle, semantic-node, or an outline such as cylinder or hexagon), keeping their id, position, size, text, colours and connectors. Use it to turn decision nodes into diamonds. One undo step.",
  input: shapeInput,
  access: "write",
  run: ({ ids, shape, skip_locked }, env) => {
    const variant = getOutlineVariant(shape);
    const { editable, skipped: locked } = editableTargets(env, ids, skip_locked);
    const changed: DrawingElement[] = [];
    const skipped = [...locked];
    for (const id of editable) {
      const current = env.ctx.index.shapes.get(id)!;
      if (!RESHAPABLE.has(current.type)) skipped.push({ id, reason: `a ${current.type} cannot be re-shaped` });
      else if (
        current.type === shape ||
        (variant && current.type === "outline" && (current as { variant?: string }).variant === variant.id)
      )
        skipped.push({ id, reason: `already a ${shape}` });
      else {
        const type = variant ? "outline" : shape;
        const next = { ...current, type } as DrawingElement & {
          nodeStyle?: unknown;
          cornerRadius?: number;
          variant?: string;
        };
        if (variant) next.variant = variant.id;
        else next.variant = undefined;
        if (type !== "semantic-node") next.nodeStyle = undefined;
        if (type !== "rectangle" && type !== "semantic-node") next.cornerRadius = undefined;
        changed.push(next);
      }
    }
    if (changed.length === 0)
      throw new ToolError(
        "unsupported",
        `Nothing was re-shaped: ${skipped.map((s) => `${s.id}: ${s.reason}`).slice(0, 4).join("; ")}.`,
        { ids: editable },
      );
    const settled = settleConnectors(env, updatePatch(changed));
    return {
      summary: `Changed ${count(changed.length, "element")} to ${shape}: ${listIds(changed.map((c) => c.id))}.`,
      data: { changed: changed.map((c) => c.id) },
      patch: settled.patch,
      skipped,
      ...(settled.warnings.length > 0 ? { warnings: settled.warnings } : {}),
    };
  },
};

// ── update_icon ───────────────────────────────────────────────────────────────

const iconInput = z
  .object({
    ids: targetIds,
    icon: z.string().min(1).max(60).optional().describe("Icon id or name to show (see search_icons)."),
    action: z
      .enum(["replace", "remove", "restore"])
      .optional()
      .describe(
        "replace (needs `icon`), remove (hide the icon; label takes the node), restore (back to the original icon, visible).",
      ),
    skip_locked: skipLocked,
    expected_revision: expectedRevision,
  })
  .strict();

export const updateIcon: ToolDefinition<typeof iconInput> = {
  name: "update_icon",
  group: "edit",
  description:
    "Change the icon of semantic nodes and standalone icons: replace it with another registry icon, hide it, or restore the original. The label, size, colour and connectors are untouched.",
  input: iconInput,
  access: "write",
  run: (input, env) => {
    const action = input.action ?? (input.icon ? "replace" : undefined);
    if (!action)
      throw new ToolError("invalid_arguments", "Give `icon` to replace the icon, or `action`: remove or restore.");
    if (action === "replace" && !input.icon)
      throw new ToolError("invalid_arguments", "`icon` is required to replace an icon.");
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    const shapes = editable.map((id) => env.ctx.index.shapes.get(id)!);
    const bad = shapes.filter((shape) => !isSemanticNode(shape) && !(shape.type === "icon" && action === "replace"));
    if (bad.length > 0 && bad.length === shapes.length) {
      throw new ToolError(
        "unsupported",
        `Icons can only be changed on semantic nodes${action === "replace" ? " and icon elements" : ""}; ${bad.slice(0, 4).map((s) => `${s.id} is a ${s.type}`).join(", ")}.`,
        { ids: bad.map((s) => s.id) },
      );
    }
    const def = action === "replace" ? resolveIcon(input.icon!) : undefined;
    const nodes = shapes.filter(isSemanticNode);
    const standalone = shapes.filter((shape) => shape.type === "icon");
    const changed: DrawingElement[] =
      action === "replace"
        ? [
            ...planReplaceIcon(nodes, def!),
            ...standalone.flatMap((shape) =>
              shape.ai?.icon === def!.id && shape.ai.customIcon === undefined
                ? []
                : ([{ ...shape, ai: { ...(shape.ai ?? {}), icon: def!.id, customIcon: undefined } }] as DrawingElement[]),
            ),
          ]
        : action === "remove"
          ? planRemoveIcon(nodes)
          : planRestoreIcon(nodes);
    return {
      summary:
        changed.length === 0
          ? `Nothing to change (${action}).`
          : `${action === "replace" ? `Set icon ${def!.id}` : action === "remove" ? "Hid the icon" : "Restored the icon"} on ${count(changed.length, "element")}: ${listIds(changed.map((c) => c.id))}.`,
      data: { changed: changed.map((c) => c.id), ...(def ? { icon: def.id } : {}) },
      patch: updatePatch(changed),
      skipped: [...locked, ...bad.map((s) => ({ id: s.id, reason: `a ${s.type} has no icon to ${action}` }))],
    };
  },
};

// ── update_semantic_node ──────────────────────────────────────────────────────

const RESETTABLE = ["icon_size", "icon_placement", "icon_color", "corner_radius"] as const;

const semanticInput = z
  .object({
    ids: targetIds,
    label: label.optional(),
    kind: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional()
      .describe("The node's kind (service, database, queue...)."),
    icon: z.string().min(1).max(60).optional().describe("Replace the icon."),
    icon_visible: z.boolean().optional(),
    icon_size: z.number().finite().min(ICON_SIZE_LIMITS.min).max(ICON_SIZE_LIMITS.max).optional(),
    icon_placement: z.enum(["left", "top", "right"]).optional(),
    icon_color: color.optional(),
    reset: z
      .array(z.enum(RESETTABLE))
      .max(RESETTABLE.length)
      .optional()
      .describe("Presentation settings to put back to their defaults."),
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
  description:
    "Edit diagram nodes: label, kind, icon (replace / show / hide), icon size, placement and colour, corner radius, fill, outline and font. Only the given properties change. Position and size use move_elements and resize_element.",
  input: semanticInput,
  access: "write",
  run: (input, env) => {
    const { editable, skipped: locked } = editableTargets(env, input.ids, input.skip_locked);
    const nodes = editable.map((id) => env.ctx.index.shapes.get(id)!);
    const notNodes = nodes.filter((shape) => !isSemanticNode(shape));
    if (notNodes.length > 0) {
      throw new ToolError(
        "unsupported",
        `update_semantic_node only edits semantic nodes; ${notNodes.slice(0, 4).map((s) => `${s.id} is a ${s.type}`).join(", ")}. Use update_element or update_shape_style for those.`,
        { ids: notNodes.map((s) => s.id) },
      );
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
      steps.push((ctx) =>
        planTypography(pick(ctx), {
          fontWeight: input.font_weight,
          italic: input.font_style === undefined ? undefined : input.font_style === "italic",
        }),
      );
    }
    if (input.kind !== undefined) {
      const kind = input.kind;
      steps.push((ctx) =>
        pick(ctx).flatMap((node) =>
          node.ai?.semanticKind === kind ? [] : ([{ ...node, ai: { ...(node.ai ?? {}), semanticKind: kind } }] as DrawingElement[]),
        ),
      );
    }
    const change = toStyleChange({
      color: input.color,
      fill: input.fill,
      stroke_width: input.stroke_width,
      opacity: input.opacity,
      font_size: input.font_size,
    });
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
      summary:
        changedIds.length === 0
          ? "The nodes already look like that; nothing changed."
          : `Updated ${count(changedIds.length, "node")}: ${listIds(changedIds)}.`,
      data: { changed: changedIds },
      patch,
      skipped,
    };
  },
};

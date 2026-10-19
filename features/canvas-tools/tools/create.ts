import { z } from "zod";
import { unionBounds } from "@/core/geometry/box";
import { planGroup } from "@/core/groups/group-commands";
import type { DocPatch } from "@/core/groups/patch";
import { isCustomIcon } from "@/features/whiteboard/utils/icon-picker";
import { mergeNodeStyle, CORNER_RADIUS_LIMITS, ICON_SIZE_LIMITS } from "@/core/shapes/semantic-node/style";
import { semanticMinSize } from "@/core/shapes/semantic-node/layout";
import { createShape, getShapeDefinition, isRotatable } from "@/core/shapes/shape-runtime";
import { ICON_NODE_GLYPH } from "@/core/shapes/icon/caption";
import { sizeIconNode, sizeSemanticNode } from "@/core/text/node-size";
import { kindColors } from "@/features/ai/server/canvas-compiler";
import { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { planDuplicate } from "@/features/whiteboard/commands/duplicate";
import { frameHeadingPosition, planFrame } from "@/features/whiteboard/commands/frame";
import { supportsStyle, type StyleKey } from "@/features/whiteboard/commands/style";
import { buildIconElement, DEFAULT_ICON_SIZE } from "@/features/whiteboard/utils/icon-picker";
import type { Bounds, DrawingElement, GroupRecord } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../errors";
import { color, coordinate, elementId, fill, label, length, MAX_ELEMENTS_PER_CALL, MAX_POINTS, newElementId, point, targetIds } from "../schemas";
import type { ToolDefinition } from "../types";
import { claimId, count, defaultOrigin, listIds, overlapWarnings, resolveIcon, resolveTargets } from "./helpers";

const normalizeText = (value: string) => value.replace(/\r\n?/g, "\n");

const strokeWidth = z.number().finite().min(0.5).max(24);
const opacity = z.number().finite().min(0).max(1).describe("0 invisible to 1 opaque.");
const fontSize = z.number().finite().min(6).max(200);
const fontWeight = z.enum(["400", "500", "600", "700", "800"]).describe('"400" normal, "600" semi-bold, "700" bold.');
const rotation = z.number().finite().min(-360).max(360).describe("Degrees clockwise.");

/** Rejects (with the property names) a style the created shape cannot show: nothing is dropped silently. */
const requireStyle = (shape: DrawingElement, wanted: Partial<Record<StyleKey, unknown>>) => {
  const unsupported = (Object.keys(wanted) as StyleKey[]).filter((key) => wanted[key] !== undefined && !supportsStyle(shape, key));
  if (unsupported.length > 0) {
    throw new ToolError("unsupported", `A ${shape.type} cannot take ${unsupported.join(", ")}. Leave ${unsupported.length === 1 ? "it" : "them"} out.`, { details: { unsupported } });
  }
};

// ── create_shape ─────────────────────────────────────────────────────────────

const BOX_SHAPES = ["rectangle", "ellipse", "diamond", "pill", "triangle"] as const;
const DEFAULT_BOX: Record<(typeof BOX_SHAPES)[number], { width: number; height: number }> = {
  rectangle: { width: 160, height: 100 },
  ellipse: { width: 160, height: 100 },
  diamond: { width: 140, height: 100 },
  pill: { width: 160, height: 60 },
  triangle: { width: 120, height: 100 },
};

const shapeInput = z
  .object({
    id: newElementId.optional(),
    shape: z.enum([...BOX_SHAPES, "line", "freehand"]).describe("rectangle, ellipse, diamond, pill (terminator), triangle, line, or freehand (a pencil stroke through `points`)."),
    x: coordinate.optional().describe("Left edge. Omit x and y to place it beside the existing content."),
    y: coordinate.optional().describe("Top edge."),
    width: length.optional(),
    height: length.optional(),
    points: z.array(point).min(2).max(MAX_POINTS).optional().describe("line and freehand only: the path, in board coordinates."),
    label: label.optional().describe("Text inside the shape (not for line or freehand)."),
    color: color.optional().describe("Outline colour."),
    fill: fill.optional(),
    stroke_width: strokeWidth.optional(),
    opacity: opacity.optional(),
    corner_radius: z.number().finite().min(0).max(CORNER_RADIUS_LIMITS.max * 2).optional().describe("Rectangles only; 0 is square."),
    font_size: fontSize.optional(),
    rotation: rotation.optional(),
  })
  .strict();

export const createShapeTool: ToolDefinition<typeof shapeInput> = {
  name: "create_shape",
  group: "create",
  description: "Draw one shape (rectangle, ellipse, diamond, pill, triangle, line, freehand) with optional label and style. For a labelled, icon-bearing box prefer create_semantic_node. Adds one element.",
  input: shapeInput,
  access: "write",
  run: (input, env) => {
    const id = claimId(env, input.id);
    const origin = defaultOrigin(env);
    const x = input.x ?? origin.x;
    const y = input.y ?? origin.y;
    const isPath = input.shape === "line" || input.shape === "freehand";

    let points;
    if (isPath) {
      if (input.points) points = input.points;
      else if (input.shape === "line") points = [{ x, y }, { x: x + (input.width ?? 160), y: y + (input.height ?? 0) }];
      else throw new ToolError("invalid_arguments", "freehand needs `points` (at least two).");
    } else {
      if (input.points) throw new ToolError("invalid_arguments", `\`points\` is only for line and freehand; give x, y, width and height for a ${input.shape}.`);
      const fallback = DEFAULT_BOX[input.shape as keyof typeof DEFAULT_BOX];
      points = [{ x, y }, { x: x + (input.width ?? fallback.width), y: y + (input.height ?? fallback.height) }];
    }
    if (isPath && input.label !== undefined) throw new ToolError("unsupported", `A ${input.shape} cannot have a label.`);

    const shape = createShape(input.shape, {
      id,
      points,
      ...(input.color ? { color: input.color } : {}),
      ...(input.stroke_width !== undefined ? { strokeWidth: input.stroke_width } : {}),
      ...(input.fill ? { fill: input.fill } : {}),
      ...(input.label !== undefined ? { label: normalizeText(input.label) } : {}),
      ...(input.font_size !== undefined ? { fontSize: input.font_size } : {}),
    });
    if (!shape) throw new ToolError("unsupported", `This editor cannot draw a "${input.shape}".`);
    requireStyle(shape, { fill: input.fill ?? undefined, cornerRadius: input.corner_radius, strokeWidth: input.stroke_width });
    if (input.label !== undefined && getShapeDefinition(shape.type)?.labelConfig?.anchor !== "center") throw new ToolError("unsupported", `A ${input.shape} cannot have a label.`);
    if (input.rotation !== undefined && !isRotatable(shape.type)) throw new ToolError("unsupported", `A ${input.shape} cannot be rotated.`);

    const created: DrawingElement = {
      ...shape,
      ...(input.corner_radius !== undefined ? { cornerRadius: input.corner_radius } : {}),
      ...(input.opacity !== undefined && input.opacity !== 1 ? { opacity: input.opacity } : {}),
      ...(input.rotation ? { rotation: input.rotation } : {}),
    } as DrawingElement;
    const bounds = env.ctx.getBounds(created);
    return {
      summary: `Created ${input.shape} "${id}"${bounds ? ` at (${Math.round(bounds.minX)}, ${Math.round(bounds.minY)}), ${Math.round(bounds.width)}x${Math.round(bounds.height)}` : ""}.`,
      data: { id, type: input.shape, ...(bounds ? { x: Math.round(bounds.minX), y: Math.round(bounds.minY), width: Math.round(bounds.width), height: Math.round(bounds.height) } : {}) },
      patch: { add: [created], update: [], remove: [] },
    };
  },
};

// ── create_text ──────────────────────────────────────────────────────────────

const textInput = z
  .object({
    id: newElementId.optional(),
    text: z.string().min(1).max(5000).describe("The text; use \\n for line breaks."),
    x: coordinate.optional(),
    y: coordinate.optional(),
    font_size: fontSize.optional(),
    font_weight: fontWeight.optional(),
    font_style: z.enum(["normal", "italic"]).optional(),
    color: color.optional(),
    opacity: opacity.optional(),
  })
  .strict();

export const createTextTool: ToolDefinition<typeof textInput> = {
  name: "create_text",
  group: "create",
  description: "Add a free text block (a title, a note, a caption). Multi-line text keeps its line breaks. Adds one element.",
  input: textInput,
  access: "write",
  run: (input, env) => {
    const id = claimId(env, input.id);
    const origin = defaultOrigin(env);
    const text = normalizeText(input.text);
    if (text.trim() === "") throw new ToolError("invalid_arguments", "`text` is empty.");
    const shape = createShape("text", {
      id,
      points: [{ x: input.x ?? origin.x, y: input.y ?? origin.y }],
      text,
      ...(input.color ? { color: input.color } : {}),
      ...(input.font_size !== undefined ? { fontSize: input.font_size } : {}),
      ...(input.font_weight ? { fontWeight: input.font_weight } : {}),
      ...(input.font_style ? { fontStyle: input.font_style } : {}),
    });
    if (!shape) throw new ToolError("unsupported", "This editor cannot create text.");
    const created = { ...shape, ...(input.opacity !== undefined && input.opacity !== 1 ? { opacity: input.opacity } : {}) } as DrawingElement;
    return {
      summary: `Created text "${id}" (${text.split("\n").length} line${text.includes("\n") ? "s" : ""}).`,
      data: { id },
      patch: { add: [created], update: [], remove: [] },
    };
  },
};

// ── create_icon ──────────────────────────────────────────────────────────────

const iconInput = z
  .object({
    id: newElementId.optional(),
    icon: z.string().min(1).max(60).describe("Icon id or common name from the registry, e.g. database, kafka, postgres (see search_icons)."),
    x: coordinate.optional().describe("Left edge."),
    y: coordinate.optional().describe("Top edge."),
    size: z.number().finite().min(16).max(256).optional().describe(`Edge of the glyph (default ${DEFAULT_ICON_SIZE}).`),
    caption: label.optional().describe("A caption drawn under the icon."),
    color: color.optional().describe("Tint of a line icon (brand marks keep their colours)."),
  })
  .strict();

export const createIconTool: ToolDefinition<typeof iconInput> = {
  name: "create_icon",
  group: "create",
  description: "Place a standalone icon from the editor's icon registry with a short caption. The default for recognisable things (services, databases, clients, devices, logos); use create_semantic_node when the label needs a box. Adds one element.",
  input: iconInput,
  access: "write",
  run: (input, env) => {
    const id = claimId(env, input.id);
    const def = resolveIcon(input.icon);
    if (isCustomIcon(def)) throw new ToolError("unsupported", "Custom icons cannot be placed by name.");
    const origin = defaultOrigin(env);
    const x = input.x ?? origin.x;
    const y = input.y ?? origin.y;
    const glyph = input.size ?? DEFAULT_ICON_SIZE;
    let element: DrawingElement;
    if (input.caption?.trim()) {
      const caption = normalizeText(input.caption.trim());
      const box = sizeIconNode({ label: caption, fontSize: 14, fontWeight: "600" });
      const width = Math.max(box.width, glyph);
      const height = Math.round(box.height - ICON_NODE_GLYPH + glyph);
      element = {
        ...buildIconElement(def, { x: 0, y: 0 }, id),
        points: [{ x, y }, { x: x + width, y: y + height }],
        label: caption,
        fontSize: 14,
        fontWeight: "600",
        ai: { icon: def.id, semanticId: id, role: "node" },
      } as DrawingElement;
    } else {
      element = { ...buildIconElement(def, { x: x + glyph / 2, y: y + glyph / 2 }, id), points: [{ x, y }, { x: x + glyph, y: y + glyph }] } as DrawingElement;
    }
    if (input.color) element = { ...element, color: input.color } as DrawingElement;
    const bounds = element.points;
    const placement = overlapWarnings(env, { x, y, width: bounds[1].x - bounds[0].x, height: bounds[1].y - bounds[0].y }, id);
    return {
      ...(placement.length > 0 ? { warnings: placement } : {}),
      summary: `Created icon "${id}" (${def.id}).`,
      data: { id, icon: def.id },
      patch: { add: [element], update: [], remove: [] },
    };
  },
};

// ── create_semantic_node ─────────────────────────────────────────────────────

const nodeInput = z
  .object({
    id: newElementId.optional(),
    label: label.min(1).describe("The node's name, shown on it."),
    x: coordinate.optional(),
    y: coordinate.optional(),
    width: length.optional().describe("Default: fitted to the label."),
    height: length.optional(),
    icon: z.string().min(1).max(60).optional().describe("Icon id or common name (database, kafka, postgres...). Default: the icon of `kind`."),
    kind: z.string().min(1).max(40).regex(/^[a-z][a-z0-9-]*$/).optional().describe("What it is, e.g. service, database, queue, cache, api, gateway, user; picks the default colours and icon."),
    fill: fill.optional(),
    color: color.optional().describe("Outline colour."),
    stroke_width: strokeWidth.optional(),
    opacity: opacity.optional(),
    font_size: fontSize.optional(),
    font_weight: fontWeight.optional(),
    icon_size: z.number().finite().min(ICON_SIZE_LIMITS.min).max(ICON_SIZE_LIMITS.max).optional(),
    icon_placement: z.enum(["left", "top", "right"]).optional(),
    icon_color: color.optional(),
    icon_visible: z.boolean().optional().describe("false hides the icon."),
    corner_radius: z.number().finite().min(CORNER_RADIUS_LIMITS.min).max(CORNER_RADIUS_LIMITS.max).optional(),
  })
  .strict();

export const createSemanticNodeTool: ToolDefinition<typeof nodeInput> = {
  name: "create_semantic_node",
  group: "create",
  description: "Create a labelled box node, optionally with an icon. For text that needs the box (longer labels, steps, decisions, descriptions); recognisable things are better as create_icon. Sized to fit its label unless width/height are given. Connectors attach to it. Adds one element.",
  input: nodeInput,
  access: "write",
  run: (input, env) => {
    const id = claimId(env, input.id);
    const origin = defaultOrigin(env);
    const x = input.x ?? origin.x;
    const y = input.y ?? origin.y;
    const text = normalizeText(input.label).trim();
    if (text === "") throw new ToolError("invalid_arguments", "`label` is empty.");
    const icon = input.icon ? resolveIcon(input.icon) : undefined;
    const size = fitNodeSize(text, input.font_size ?? 17, input.font_weight ?? "600");
    const nodeStyle = mergeNodeStyle(undefined, {
      iconSize: input.icon_size,
      iconPlacement: input.icon_placement,
      iconColor: input.icon_color,
      iconHidden: input.icon_visible === false ? true : undefined,
      cornerRadius: input.corner_radius,
    });
    const min = semanticMinSize(nodeStyle);
    const warnings: string[] = [];
    let width = input.width ?? size.width;
    let height = input.height ?? size.height;
    if (width < min.width || height < min.height) {
      warnings.push(`The node is smaller than the smallest size that shows its content (${min.width}x${min.height}); it was enlarged.`);
      width = Math.max(width, min.width);
      height = Math.max(height, min.height);
    }
    const byKind = input.kind ? kindColors(input.kind) : undefined;
    const shape = createShape("semantic-node", {
      id,
      points: [{ x, y }, { x: x + width, y: y + height }],
      label: text,
      color: input.color ?? byKind?.stroke,
      fill: input.fill === null ? undefined : (input.fill ?? byKind?.fill),
      ...(input.stroke_width !== undefined ? { strokeWidth: input.stroke_width } : {}),
      ...(input.font_size !== undefined ? { fontSize: input.font_size } : {}),
      ...(input.font_weight ? { fontWeight: input.font_weight } : {}),
      ai: { semanticId: id, role: "node", ...(input.kind ? { semanticKind: input.kind } : {}), ...(icon ? { icon: icon.id } : {}) },
      ...(nodeStyle ? { nodeStyle } : {}),
    });
    if (!shape) throw new ToolError("unsupported", "This editor cannot create semantic nodes.");
    // `fill: null` asked for no fill: the definition would otherwise supply its default.
    const created = {
      ...shape,
      ...(input.fill === null ? { fill: undefined } : {}),
      ...(input.opacity !== undefined && input.opacity !== 1 ? { opacity: input.opacity } : {}),
    } as DrawingElement;
    if (input.fill === null) delete (created as { fill?: string }).fill;
    warnings.push(...overlapWarnings(env, { x, y, width, height }, id));
    return {
      summary: `Created node "${text}" as "${id}"${icon ? ` with the ${icon.id} icon` : ""}.`,
      data: { id, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), icon: icon?.id ?? undefined },
      patch: { add: [created], update: [], remove: [] },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};

/** Width and height a node needs for its label, the way AI diagrams size theirs. */
const fitNodeSize = (label: string, size: number, weight: string) => {
  const input = (maxWidth: number) => ({ label, fontSize: size, fontWeight: weight, minWidth: 168, maxWidth, minHeight: 78 });
  let fit = sizeSemanticNode(input(280));
  for (let width = 360; !fit.fits && width <= 520; width += 80) fit = sizeSemanticNode(input(width));
  return fit;
};

// ── create_group ─────────────────────────────────────────────────────────────

export const groupElementsPatch = (env: Parameters<ToolDefinition["run"]>[1], ids: readonly string[], options: { id?: string; name?: string }) => {
  const { ctx } = env;
  const { shapeIds } = resolveTargets(env, ids);
  const wanted = options.id === undefined ? undefined : claimId(env, options.id);
  const plan = planGroup(ctx.stored, shapeIds, () => wanted ?? claimId(env, undefined));
  if (!plan) {
    throw new ToolError("invalid_state", "Grouping needs at least two unlocked elements or groups. Check the ids, and unlock locked elements first.", { ids: [...shapeIds] });
  }
  const name = options.name?.trim().slice(0, 80);
  const add = name ? plan.patch.add.map((item) => (item.id === plan.groupId ? ({ ...item, name } as GroupRecord) : item)) : plan.patch.add;
  const patch: DocPatch = { ...plan.patch, add };
  return { patch, groupId: plan.groupId, selection: plan.selection };
};

const groupInput = z
  .object({
    ids: targetIds.describe("At least two elements (or groups) to put in the new group; \"@selection\" counts as its elements. Connectors between them keep working."),
    name: z.string().min(1).max(80).describe("The group's name."),
    id: newElementId.optional(),
  })
  .strict();

export const createGroupTool: ToolDefinition<typeof groupInput> = {
  name: "create_group",
  group: "create",
  description: "Create a named group from existing elements. Members keep their positions, ids and connectors; the group moves, locks and hides as one. Locked members are refused.",
  input: groupInput,
  access: "write",
  run: ({ ids, name, id }, env) => {
    const { patch, groupId, selection } = groupElementsPatch(env, ids, { id, name });
    return { summary: `Grouped ${count(selection.length, "element")} as "${name}" (${groupId}).`, data: { id: groupId, name, members: selection }, patch, selection };
  },
};

// ── create_frame_or_section ──────────────────────────────────────────────────

const frameInput = z
  .object({
    title: z.string().min(1).max(120).describe("Heading shown on the frame."),
    ids: targetIds.optional().describe("Wrap these elements. Nothing inside moves."),
    bounds: z.object({ x: coordinate, y: coordinate, width: length, height: length }).strict().optional().describe("An empty frame of this size (when no ids are given)."),
    padding: z.number().finite().min(0).max(400).optional(),
    id: newElementId.optional(),
  })
  .strict();

export const createFrameTool: ToolDefinition<typeof frameInput> = {
  name: "create_frame_or_section",
  group: "create",
  description: "Draw a titled frame (section) around elements, or at a given size: an outline plus heading behind the content, not a group; it does not follow its contents (see fit_frame). Adds two elements.",
  input: frameInput,
  access: "write",
  run: ({ title, ids, bounds, padding, id }, env) => {
    if (!ids && !bounds) throw new ToolError("invalid_arguments", "Give `ids` to wrap or `bounds` for an empty frame.");
    const { ctx } = env;
    const frameId = claimId(env, id);
    if (ctx.index.shapes.has(`${frameId}-label`)) throw new ToolError("conflict", `"${frameId}-label" already exists.`);
    const shapeIds = ids ? resolveTargets(env, ids).shapeIds : [];
    const box: Bounds | undefined = bounds
      ? { minX: bounds.x, minY: bounds.y, maxX: bounds.x + bounds.width, maxY: bounds.y + bounds.height, width: bounds.width, height: bounds.height }
      : undefined;
    const plan = planFrame(ctx, shapeIds, { title: normalizeText(title).trim(), id: frameId, padding, bounds: box });
    if (!plan) throw new ToolError("invalid_state", "The frame has nothing to surround (the elements have no size).");
    const warnings = looseFrameWarning(env, plan.bounds, shapeIds);
    // Frames are outlines: they sit behind the content, as in diagrams the AI draws.
    const order = [plan.ids.frame, plan.ids.label, ...ctx.stored.map((item) => item.id)];
    return {
      summary: `Created frame "${title}" (${frameId})${shapeIds.length > 0 ? ` around ${count(shapeIds.length, "element")}` : ""}.`,
      data: { id: frameId, labelId: plan.ids.label, x: Math.round(plan.bounds.minX), y: Math.round(plan.bounds.minY), width: Math.round(plan.bounds.width), height: Math.round(plan.bounds.height) },
      patch: { ...plan.patch, order },
      warnings,
    };
  },
};

/** A frame much larger than what it holds reads as empty space and swallows the connectors beside it. */
const looseFrameWarning = (env: Parameters<ToolDefinition["run"]>[1], frame: Bounds, members: readonly string[]): string[] => {
  const boxes = members.flatMap((id) => {
    const shape = env.ctx.index.shapes.get(id);
    return shape ? (env.ctx.getBounds(shape) ?? []) : [];
  });
  if (boxes.length < 2) return [];
  const used = boxes.reduce((sum, b) => sum + b.width * b.height, 0);
  if (frame.width * frame.height <= used * 4) return [];
  return ["The frame is much larger than its members: they sit far apart, so it also covers empty space and the connectors between them. Bring the members together (move_elements or auto_layout on them) and call fit_frame."];
};

// ── fit_frame ────────────────────────────────────────────────────────────────

const fitFrameInput = z
  .object({
    frame: elementId.describe("The frame."),
    ids: targetIds.describe("All its members now."),
  })
  .strict();

export const fitFrameTool: ToolDefinition<typeof fitFrameInput> = {
  name: "fit_frame",
  group: "create",
  alsoWith: ["edit", "arrange", "connect", "organize"],
  description: "Re-fit a frame around its members (heading included). Frames do not follow their contents: call after moving, adding or removing members.",
  input: fitFrameInput,
  access: "write",
  run: ({ frame, ids }, env) => {
    const { ctx } = env;
    const frameId = frame.endsWith("-label") && ctx.index.shapes.has(frame.slice(0, -"-label".length)) ? frame.slice(0, -"-label".length) : frame;
    const rect = ctx.index.shapes.get(frameId);
    const label = ctx.index.shapes.get(`${frameId}-label`);
    if (!rect) throw new ToolError("not_found", `No frame with id ${frameId}.`);
    if (rect.ai?.role !== "group" || rect.type !== "rectangle") throw new ToolError("invalid_state", `${frameId} is not a frame made by create_frame_or_section.`);
    if (rect.locked || label?.locked) throw new ToolError("locked", `The frame ${frameId} is locked. Unlock it first (unlock_elements).`);
    const members = resolveTargets(env, ids).shapeIds.filter((id) => id !== frameId && id !== `${frameId}-label`);
    const plan = planFrame(ctx, members, { title: "", id: "fit-probe" });
    if (!plan) throw new ToolError("invalid_state", "The elements have no size to surround.");
    const { minX, minY, maxX, maxY } = plan.bounds;
    const moved = [{ ...rect, points: [{ x: minX, y: minY }, { x: maxX, y: maxY }] } as DrawingElement];
    if (label) moved.push({ ...label, points: [frameHeadingPosition(ctx, plan.bounds, label.text ?? "")] } as DrawingElement);
    const warnings = looseFrameWarning(env, plan.bounds, members);
    return {
      warnings,
      summary: `Fitted ${frameId} around ${count(members.length, "element")}.`,
      data: { id: frameId, x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) },
      patch: { add: [], update: moved, remove: [] },
    };
  },
};

// ── duplicate_elements ───────────────────────────────────────────────────────

const duplicateInput = z
  .object({
    ids: targetIds,
    offset_steps: z.number().int().min(1).max(20).optional().describe("How many 24-unit steps down and right the copies land (default 1)."),
  })
  .strict();

export const duplicateElementsTool: ToolDefinition<typeof duplicateInput> = {
  name: "duplicate_elements",
  group: "create",
  description: "Copy elements (with the connectors that join two copied elements, and their groups). Copies get new ids and sit slightly down and right; the originals are untouched. Returns the old-to-new id map.",
  input: duplicateInput,
  access: "write",
  run: ({ ids, offset_steps }, env) => {
    const { shapeIds } = resolveTargets(env, ids);
    const plan = planDuplicate(env.ctx, new Set(shapeIds), offset_steps ?? 1);
    if (!plan) throw new ToolError("invalid_state", "There is nothing to copy.");
    return {
      summary: `Duplicated ${count(shapeIds.length, "element")} as ${count(plan.selection.length, "new element")}: ${listIds(plan.selection)}.`,
      data: { idMap: Object.fromEntries(plan.idMap), created: plan.selection },
      patch: plan.patch,
      selection: plan.selection,
    };
  },
};

// ── import_diagram ───────────────────────────────────────────────────────────

const importInput = z
  .object({
    code: z.string().min(1).max(60_000).describe("Diagram code: lines like `API [kind: service] -> DB [kind: database]`, with optional groups."),
    x: coordinate.optional().describe("Left edge of the imported diagram. Default: beside the existing content."),
    y: coordinate.optional().describe("Top edge."),
  })
  .strict();

export const importDiagramTool: ToolDefinition<typeof importInput> = {
  name: "import_diagram",
  group: "create",
  description: "Add a diagram written in the editor's diagram code (nodes, labelled connections, groups) as new, laid-out elements. Existing elements are never touched or replaced. Fails with the code's line errors if it does not parse.",
  input: importInput,
  access: "write",
  run: ({ code, x, y }, env) => {
    const parsed = parseDiagramCode(code);
    const errors = parsed.issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      throw new ToolError("invalid_arguments", `The diagram code has ${count(errors.length, "error")}: ${errors.slice(0, 5).map((e) => `line ${e.line}: ${e.message}`).join("; ")}.`, { details: { issues: errors.slice(0, 10) } });
    }
    if (parsed.nodes.length > MAX_ELEMENTS_PER_CALL) {
      throw new ToolError("limit_exceeded", `The diagram has ${parsed.nodes.length} nodes; import at most ${MAX_ELEMENTS_PER_CALL} per call.`);
    }
    const generation = claimId(env, undefined);
    const frameId = `frame-${generation}`;
    const result = elementsFromDiagramCode(code, { generationId: generation, frameId });
    const fatal = result.issues.filter((issue) => issue.severity === "error");
    if (fatal.length > 0 || result.elements.length === 0) {
      throw new ToolError("invalid_arguments", `Nothing could be drawn: ${(fatal[0] ?? { message: "the code has no nodes" }).message}`);
    }
    const origin = defaultOrigin(env);
    const box = unionBounds(result.elements.flatMap((el) => env.ctx.getBounds(el) ?? []));
    const dx = (x ?? origin.x) - (box?.minX ?? 0);
    const dy = (y ?? origin.y) - (box?.minY ?? 0);
    const moved = result.elements.map((el) => ({ ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })) as DrawingElement[];
    const taken = moved.filter((el) => env.ctx.index.shapes.has(el.id) || env.ctx.index.groups.has(el.id));
    if (taken.length > 0) throw new ToolError("conflict", "The imported elements collide with ids already on the board; try again.", { ids: taken.map((el) => el.id).slice(0, 5) });
    const nodes = moved.filter((el) => el.ai?.role === "node");
    return {
      summary: `Imported ${count(nodes.length, "node")} and ${count(moved.filter((el) => el.type === "arrow").length, "connector")} (${moved.length} elements).`,
      data: { created: moved.map((el) => el.id), nodes: nodes.map((el) => ({ id: el.id, label: el.label, node: el.ai?.semanticId })) },
      warnings: result.issues.filter((issue) => issue.severity !== "error").map((issue) => `line ${issue.line}: ${issue.message}`).slice(0, 8),
      patch: { add: moved, update: [], remove: [] },
    };
  },
};

export const CREATE_TOOLS = [createShapeTool, createTextTool, createIconTool, createSemanticNodeTool, createGroupTool, createFrameTool, fitFrameTool, duplicateElementsTool, importDiagramTool] as const;


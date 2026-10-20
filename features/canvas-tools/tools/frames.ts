import { z } from "zod";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import {
  addToFrame,
  combine,
  createFrame,
  deleteFrame,
  fitFrameToContent,
  frameSelection,
  listFrameContents,
  listFrames,
  nestFrame,
  removeFromFrame,
  resizeFrame,
  updateFrame,
  type FrameChanges,
  type FrameErrorCode,
  type FrameFailure,
  type Skipped,
} from "@/core/frames/frame-api";
import { buildFrameIndex } from "@/core/frames/frame-index";
import { FRAME_PRESETS, frameBox } from "@/core/frames/frame-model";
import { frameHeadingPosition, planFrame } from "@/features/whiteboard/commands/frame";
import type { Bounds, DrawingElement, FrameShape } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError, type ToolErrorCode } from "../errors";
import { color, coordinate, elementId, fill, length, newElementId, targetIds } from "../schemas";
import type { ToolDefinition } from "../types";
import { claimId, count, listIds, resolveTargets } from "./helpers";

/**
 * The agent's frame tools. Every one is a thin wrapper over `core/frames/frame-api`, the same functions the
 * editor's frame tool, the menus and the diagram-code language use, so a frame made by the agent is the frame a
 * person would have made: a real element that owns what is in it, not a rectangle with a text on top.
 */

const CODES: Record<FrameErrorCode, ToolErrorCode> = {
  not_found: "not_found",
  not_a_frame: "invalid_state",
  locked: "locked",
  cycle: "invalid_state",
  too_deep: "limit_exceeded",
  invalid: "invalid_arguments",
  auto_fit: "invalid_state",
  exists: "conflict",
};
const HINTS: Partial<Record<FrameErrorCode, string>> = {
  not_a_frame: " Frames are listed by list_frames; groups have group tools (group_elements, rename_group).",
  auto_fit: " update_frame {id, auto_fit: false} turns that off, or fit_frame re-fits it.",
  locked: " Unlock it first (unlock_elements).",
};

const toolError = (failure: FrameFailure, ids?: string[]) => new ToolError(CODES[failure.code], `${failure.message}${HINTS[failure.code] ?? ""}`, ids ? { ids } : undefined);

/** The frame call's result, or the tool error it stands for. */
const ok = <T extends object>(result: ({ ok: true; patch: DocPatch } & T) | FrameFailure, ids?: string[]): { patch: DocPatch } & T => {
  if (!result.ok) throw toolError(result, ids);
  return result;
};

const skippedOf = (skipped: readonly Skipped[]) => skipped.map(({ id, reason }) => ({ id, reason: reason === "unchanged" ? "already there" : reason === "self" ? "a frame cannot hold itself" : reason }));

const frameOf = (env: Parameters<ToolDefinition["run"]>[1], id: string): FrameShape => {
  const shape = env.ctx.index.shapes.get(id);
  if (!shape) throw new ToolError("not_found", `No element with id "${id}". list_frames shows the frames on the board.`, { ids: [id] });
  if (shape.type !== "frame") throw new ToolError("invalid_state", `"${id}" is not a frame (it is a ${shape.type}).${env.ctx.index.groups.has(id) ? " It is a group." : ""} list_frames shows the frames on the board.`, { ids: [id] });
  return shape;
};

const boxData = (box: Bounds | null) => (box ? { x: Math.round(box.minX), y: Math.round(box.minY), width: Math.round(box.width), height: Math.round(box.height) } : null);

const style = {
  color: color.optional().describe("Border colour."),
  fill: fill.optional().describe("Background colour; null for none."),
  padding: z.number().finite().min(0).max(400).optional().describe("Space between content and border when fitted (default 24)."),
  preset: z.enum(FRAME_PRESETS as unknown as [string, ...string[]]).optional().describe("section, container, feature-group, swimlane or device."),
  auto_fit: z.boolean().optional().describe("true: the box always wraps its members."),
};

// ── create_frame_or_section ──────────────────────────────────────────────────

const createInput = z
  .object({
    title: z.string().min(1).max(120).describe("Heading shown on the frame."),
    ids: targetIds.optional().describe("Wrap these existing elements (groups count as one). They stay where they are."),
    bounds: z.object({ x: coordinate, y: coordinate, width: length, height: length }).strict().optional().describe("Instead of ids: an empty frame of this size."),
    id: newElementId.optional(),
  })
  .strict();

export const createFrameTool: ToolDefinition<typeof createInput> = {
  name: "create_frame_or_section",
  group: "organize",
  alsoWith: ["create", "edit", "arrange", "connect"],
  description:
    "Create a frame (a titled section that owns what is inside it) around existing elements (ids), or empty at a given size (bounds). Nothing inside moves or is recreated; connectors stay. Wrapping elements that are all in a frame nests the new one inside it. Style it afterwards with update_frame.",
  input: createInput,
  access: "write",
  run: ({ title, ids, bounds, id }, env) => {
    if (!ids && !bounds) throw new ToolError("invalid_arguments", "Give `ids` to wrap existing elements, or `bounds` for a frame of a given size.");
    if (ids && bounds) throw new ToolError("invalid_arguments", "Give `ids` or `bounds`, not both: with ids the frame is sized around those elements.");
    const frameId = claimId(env, id);
    const { stored } = env.ctx;
    let patch: DocPatch;
    if (ids) {
      const members = resolveTargets(env, ids).shapeIds.filter((member) => member !== frameId);
      patch = ok(frameSelection(stored, members, { id: frameId, title: title.trim() }), members).patch;
    } else {
      const box: Bounds = { minX: bounds!.x, minY: bounds!.y, maxX: bounds!.x + bounds!.width, maxY: bounds!.y + bounds!.height, width: bounds!.width, height: bounds!.height };
      patch = ok(createFrame(stored, { id: frameId, box, title: title.trim() })).patch;
    }
    const after = buildFrameIndex(applyPatch(stored, patch));
    const members = after.childrenOf.get(frameId) ?? [];
    const frame = after.frames.get(frameId);
    return {
      summary: `Created frame "${title}" (${frameId})${members.length > 0 ? ` holding ${count(members.length, "element")}` : " (empty)"}.`,
      data: { id: frameId, title, ...boxData(frame ? frameBox(frame) : null), members: members.slice(0, 60), ...(after.parentOf.get(frameId) ? { parent: after.parentOf.get(frameId) } : {}) },
      patch,
      selection: [frameId],
    };
  },
};

// ── update_frame ─────────────────────────────────────────────────────────────

const updateInput = z
  .object({
    id: elementId.describe("The frame."),
    title: z.string().max(200).optional().describe('New title (empty resets to "Frame"). Nothing moves.'),
    ...style,
    corner_radius: z.number().finite().min(0).max(200).optional(),
    header_visible: z.boolean().optional(),
    preset: z.union([z.enum(FRAME_PRESETS as unknown as [string, ...string[]]), z.null()]).optional().describe("A look, or null for none."),
    parent: z.union([elementId, z.null()]).optional().describe("Nest this frame in another frame, or null to take it out. Nothing moves."),
  })
  .strict();

export const updateFrameTool: ToolDefinition<typeof updateInput> = {
  name: "update_frame",
  group: "organize",
  description:
    "Change a frame: rename it (title), restyle it, turn auto_fit on or off, or nest it (parent). A rename moves nothing. Membership is add_to_frame / remove_from_frame; size is fit_frame / resize_frame.",
  input: updateInput,
  access: "write",
  run: (input, env) => {
    const frame = frameOf(env, input.id);
    const changes: FrameChanges = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.fill !== undefined ? { fill: input.fill } : {}),
      ...(input.corner_radius !== undefined ? { cornerRadius: input.corner_radius } : {}),
      ...(input.padding !== undefined ? { padding: input.padding } : {}),
      ...(input.header_visible !== undefined ? { headerVisible: input.header_visible } : {}),
      ...(input.auto_fit !== undefined ? { autoFit: input.auto_fit } : {}),
      ...(input.preset !== undefined ? { preset: input.preset as FrameChanges["preset"] } : {}),
    };
    const nests = input.parent !== undefined;
    if (Object.keys(changes).length === 0 && !nests) throw new ToolError("invalid_arguments", "Nothing to change: give a title, a style, auto_fit or a parent.");
    const { stored } = env.ctx;
    const patches: DocPatch[] = [];
    let working = stored;
    if (Object.keys(changes).length > 0) {
      const styled = ok(updateFrame(working, input.id, changes), [input.id]);
      patches.push(styled.patch);
      working = applyPatch(working, styled.patch);
    }
    if (nests) {
      const nested = ok(nestFrame(working, input.id, input.parent!), [input.id]);
      patches.push(nested.patch);
    }
    const patch = combine(stored, patches);
    const label = input.title !== undefined ? ` Renamed to "${input.title.trim() || "Frame"}".` : "";
    return { summary: `Updated frame ${input.id}.${label}${Object.keys(changes).filter((key) => key !== "title").length > 0 ? ` Changed: ${Object.keys(changes).filter((key) => key !== "title").join(", ")}.` : ""}${nests ? ` ${input.parent === null ? "Taken out to the canvas." : `Now inside ${input.parent}.`}` : ""}`, data: { id: frame.id, changed: Object.keys(changes), ...(nests ? { parent: input.parent } : {}) }, patch };
  },
};

// ── resize_frame ─────────────────────────────────────────────────────────────

const resizeInput = z
  .object({
    id: elementId.describe("The frame."),
    x: coordinate.optional().describe("Left edge."),
    y: coordinate.optional().describe("Top edge."),
    width: length.optional(),
    height: length.optional(),
  })
  .strict();

export const resizeFrameTool: ToolDefinition<typeof resizeInput> = {
  name: "resize_frame",
  group: "organize",
  alsoWith: ["edit", "arrange"],
  description:
    "Set a frame's box by hand: any of x, y, width, height. Contents do not move or change owner. Refused for an auto-fit frame. To wrap the contents use fit_frame; to move frame and contents together use move_elements.",
  input: resizeInput,
  access: "write",
  run: ({ id, x, y, width, height }, env) => {
    const frame = frameOf(env, id);
    if (x === undefined && y === undefined && width === undefined && height === undefined) throw new ToolError("invalid_arguments", "Give at least one of x, y, width, height.");
    const current = frameBox(frame);
    if (!current) throw new ToolError("invalid_state", `Frame "${id}" has no usable box.`, { ids: [id] });
    const minX = x ?? current.minX;
    const minY = y ?? current.minY;
    const maxX = minX + (width ?? current.width);
    const maxY = minY + (height ?? current.height);
    const result = ok(resizeFrame(env.ctx.stored, id, { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }), [id]);
    const index = buildFrameIndex(applyPatch(env.ctx.stored, result.patch));
    const outside = (index.childrenOf.get(id) ?? []).filter((child) => {
      const shape = index.shapes.get(child);
      const bounds = shape ? env.ctx.getBounds(shape) : null;
      return bounds !== null && (bounds.minX < result.box.minX || bounds.minY < result.box.minY || bounds.maxX > result.box.maxX || bounds.maxY > result.box.maxY);
    });
    return {
      summary: `Resized frame ${id} to ${Math.round(result.box.width)} x ${Math.round(result.box.height)} at (${Math.round(result.box.minX)}, ${Math.round(result.box.minY)}).`,
      data: { id, ...boxData(result.box) },
      patch: result.patch,
      warnings: outside.length > 0 ? [`${count(outside.length, "member")} now stick out of the frame (${listIds(outside)}): fit_frame wraps the members, or move them.`] : [],
    };
  },
};

// ── add_to_frame / remove_from_frame ─────────────────────────────────────────

const addInput = z
  .object({
    frame: elementId.describe("The frame that should own them."),
    ids: targetIds.describe("Existing elements, groups or frames to put in. Nothing is recreated."),
    fit: z.boolean().optional().describe("Fit the frame around its members afterwards (default true)."),
  })
  .strict();

export const addToFrameTool: ToolDefinition<typeof addInput> = {
  name: "add_to_frame",
  group: "organize",
  alsoWith: ["create", "edit", "arrange", "connect"],
  description:
    "Make existing elements part of a frame (out of any frame they were in) and by default fit the frame around its members. The elements stay where they are; the frame grows.",
  input: addInput,
  access: "write",
  run: ({ frame, ids, fit }, env) => {
    frameOf(env, frame);
    const members = resolveTargets(env, ids).shapeIds.filter((member) => member !== frame);
    if (members.length === 0) throw new ToolError("invalid_arguments", "Give elements other than the frame itself.");
    const { stored } = env.ctx;
    const added = ok(addToFrame(stored, frame, members), [frame]);
    const patches = [added.patch];
    if (fit !== false) patches.push(ok(fitFrameToContent(applyPatch(stored, added.patch), frame), [frame]).patch);
    const patch = combine(stored, patches);
    const index = buildFrameIndex(applyPatch(stored, patch));
    const box = frameBox(index.frames.get(frame)!);
    return {
      summary: added.changed.length > 0 ? `Put ${count(added.changed.length, "element")} in frame ${frame}: ${listIds(added.changed)}.${fit !== false ? " The frame was fitted around its members." : ""}` : `Nothing changed: those elements are already in frame ${frame}.`,
      data: { frame, added: added.changed, members: (index.childrenOf.get(frame) ?? []).slice(0, 60), ...boxData(box) },
      patch,
      skipped: skippedOf(added.skipped),
    };
  },
};

const removeInput = z
  .object({
    ids: targetIds.describe("Elements to take out of their frame."),
    to_top_level: z.boolean().optional().describe("Put them on the canvas; default is up one level."),
  })
  .strict();

export const removeFromFrameTool: ToolDefinition<typeof removeInput> = {
  name: "remove_from_frame",
  group: "organize",
  alsoWith: ["create", "edit", "arrange", "connect"],
  description:
    "Take elements out of their frame without deleting or moving them. If they still sit in its box, move_elements them clear and fit_frame. Elements in no frame are skipped.",
  input: removeInput,
  access: "write",
  run: ({ ids, to_top_level }, env) => {
    const members = resolveTargets(env, ids).shapeIds;
    const result = ok(removeFromFrame(env.ctx.stored, members, { toTopLevel: to_top_level === true }));
    return {
      summary: result.changed.length > 0 ? `Took ${count(result.changed.length, "element")} out of their frame: ${listIds(result.changed)}.` : "Nothing changed: none of those elements is in a frame.",
      data: { removed: result.changed },
      patch: result.patch,
      skipped: skippedOf(result.skipped),
      warnings: result.changed.length > 0 ? ["They were not moved. If they still sit inside the frame's box, move them out; fit_frame shrinks the frame around what is left."] : [],
    };
  },
};

// ── delete_frame ─────────────────────────────────────────────────────────────

const BULK_DELETE = 25;

const deleteInput = z
  .object({
    id: elementId.describe("The frame."),
    contents: z.enum(["release", "delete"]).optional().describe('"release" (default): only the frame goes. "delete": its contents and their connectors go too.'),
    confirm: z.literal(true).optional().describe(`Needed (the person is asked) when ${BULK_DELETE} or more elements would go.`),
  })
  .strict();

export const deleteFrameTool: ToolDefinition<typeof deleteInput> = {
  name: "delete_frame",
  group: "organize",
  description: 'Delete a frame. By default only the frame goes and everything in it stays; contents "delete" removes what it owns too. Locked frames or contents are refused.',
  input: deleteInput,
  access: "write",
  strictRevision: true,
  run: async ({ id, contents = "release", confirm }, env) => {
    frameOf(env, id);
    const result = ok(deleteFrame(env.ctx.stored, id, { contents }), [id]);
    const removed = result.patch.remove.filter((gone) => env.ctx.index.shapes.has(gone));
    if (contents === "delete" && removed.length >= BULK_DELETE) {
      if (!confirm) throw new ToolError("confirmation_required", `This would delete ${removed.length} elements. Repeat the call with confirm: true if that is what was asked for, or use contents "release" to keep them.`, { details: { wouldRemove: removed.length } });
      await env.confirm(`Delete frame "${id}" and the ${removed.length - 1} elements in it?`);
    }
    return {
      summary: contents === "release" ? `Deleted frame ${id}; its contents were kept.` : `Deleted frame ${id} and ${count(removed.length - 1, "element")} in it.`,
      data: { removed: result.patch.remove, contents },
      patch: result.patch,
    };
  },
};

// ── list_frames ──────────────────────────────────────────────────────────────

const listInput = z
  .object({
    frame: elementId.optional().describe("List what this frame holds; omit to list every frame."),
    deep: z.boolean().optional().describe("Include what nested frames hold."),
  })
  .strict();

export const listFramesTool: ToolDefinition<typeof listInput> = {
  name: "list_frames",
  group: "organize",
  alsoWith: ["create", "edit", "arrange"],
  description: "List the frames on the board (id, title, parent, size, members, auto-fit), or with `frame` what one frame holds. Changes nothing. Check it before framing so existing frames are reused.",
  input: listInput,
  access: "read",
  run: ({ frame, deep }, env) => {
    const { stored } = env.ctx;
    if (frame !== undefined) {
      frameOf(env, frame);
      const listed = listFrameContents(stored, frame, { deep });
      if (!listed.ok) throw toolError(listed, [frame]);
      const items = listed.items.map((item) => {
        const shape = env.ctx.index.shapes.get(item.id);
        const label = shape?.type === "frame" ? (shape as FrameShape).title : (shape as DrawingElement | undefined)?.label;
        return { ...item, ...(label ? { label: label.slice(0, 60) } : {}) };
      });
      return { summary: `Frame ${frame} holds ${count(items.length, "element")}${items.length > 0 ? `: ${listIds(items.map((item) => item.id))}` : ""}.`, data: { frame, items: items.slice(0, 200), truncated: items.length > 200 } };
    }
    const frames = listFrames(stored).map((summary) => ({ id: summary.id, title: summary.title, parent: summary.parent, depth: summary.depth, ...boxData(summary.box), members: summary.children, autoFit: summary.autoFit, ...(summary.locked ? { locked: true } : {}) }));
    return { summary: frames.length > 0 ? `${count(frames.length, "frame")}: ${frames.slice(0, 8).map((f) => `${f.id} "${f.title}"`).join(", ")}${frames.length > 8 ? ", ..." : ""}.` : "There are no frames on the board.", data: { frames: frames.slice(0, 100), truncated: frames.length > 100 } };
  },
};

// ── fit_frame ────────────────────────────────────────────────────────────────

const fitInput = z
  .object({
    frame: elementId.describe("The frame."),
    ids: targetIds.optional().describe("Elements to put in the frame first (required for an older outline frame)."),
  })
  .strict();

export const fitFrameTool: ToolDefinition<typeof fitInput> = {
  name: "fit_frame",
  group: "organize",
  alsoWith: ["create", "edit", "arrange", "connect"],
  description:
    "Fit a frame around what it holds (padding and header included). Frames do not follow their contents unless auto_fit is on: call after moving, adding or removing members.",
  input: fitInput,
  access: "write",
  run: ({ frame, ids }, env) => {
    const { ctx } = env;
    const frameId = frame.endsWith("-label") && ctx.index.shapes.has(frame.slice(0, -"-label".length)) ? frame.slice(0, -"-label".length) : frame;
    const target = ctx.index.shapes.get(frameId);
    if (target && target.type !== "frame") return fitLegacy(env, frameId, ids);
    frameOf(env, frameId);
    const { stored } = ctx;
    const patches: DocPatch[] = [];
    let working = stored;
    let skipped: Skipped[] = [];
    if (ids) {
      const members = resolveTargets(env, ids).shapeIds.filter((member) => member !== frameId);
      const added = ok(addToFrame(working, frameId, members), [frameId]);
      skipped = added.skipped;
      patches.push(added.patch);
      working = applyPatch(working, added.patch);
    }
    const fitted = ok(fitFrameToContent(working, frameId), [frameId]);
    patches.push(fitted.patch);
    const patch = combine(stored, patches);
    const index = buildFrameIndex(applyPatch(stored, patch));
    const members = index.childrenOf.get(frameId) ?? [];
    return {
      summary: members.length === 0 ? `Frame ${frameId} is empty, so there was nothing to fit.` : `Fitted ${frameId} around ${count(members.length, "member")}.`,
      data: { id: frameId, members: members.slice(0, 60), ...boxData(frameBox(index.frames.get(frameId)!)) },
      patch,
      skipped: skippedOf(skipped.filter((entry) => entry.reason !== "unchanged")),
    };
  },
};

/** A board from before frames were elements: an outline rectangle with a heading text (see planFrame). Re-fit as it always was. */
const fitLegacy = (env: Parameters<ToolDefinition["run"]>[1], frameId: string, ids: readonly string[] | undefined) => {
  const { ctx } = env;
  const rect = ctx.index.shapes.get(frameId);
  const label = ctx.index.shapes.get(`${frameId}-label`);
  if (!rect || rect.ai?.role !== "group" || rect.type !== "rectangle") throw new ToolError("invalid_state", `${frameId} is not a frame. list_frames shows the frames on the board.`, { ids: [frameId] });
  if (!ids) throw new ToolError("invalid_arguments", `${frameId} is an older outline frame that does not know its members: pass ids with all its members.`);
  if (rect.locked || label?.locked) throw new ToolError("locked", `The frame ${frameId} is locked. Unlock it first (unlock_elements).`);
  const members = resolveTargets(env, ids).shapeIds.filter((id) => id !== frameId && id !== `${frameId}-label`);
  const plan = planFrame(ctx, members, { title: "", id: "fit-probe" });
  if (!plan) throw new ToolError("invalid_state", "The elements have no size to surround.");
  const { minX, minY, maxX, maxY } = plan.bounds;
  const moved = [{ ...rect, points: [{ x: minX, y: minY }, { x: maxX, y: maxY }] } as DrawingElement];
  if (label) moved.push({ ...label, points: [frameHeadingPosition(ctx, plan.bounds, label.text ?? "")] } as DrawingElement);
  return {
    summary: `Fitted ${frameId} around ${count(members.length, "element")}.`,
    data: { id: frameId, x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) },
    patch: { add: [], update: moved, remove: [] } as DocPatch,
  };
};

export const FRAME_TOOLS = [createFrameTool, updateFrameTool, resizeFrameTool, addToFrameTool, removeFromFrameTool, fitFrameTool, deleteFrameTool, listFramesTool] as const;

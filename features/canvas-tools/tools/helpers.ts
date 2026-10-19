import { ancestorsOf, expandUnits, isEffectivelyLocked, selectedShapeIds, selectionUnits, groupLabel } from "@/core/groups/group-index";
import { isHiddenByFlag } from "@/core/groups/visibility";
import { unionBounds } from "@/core/geometry/box";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import { getIcon, iconForNode, resolveIconId, searchIcons, type IconDef } from "@/core/icons/registry";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import { createCommandContext } from "@/features/whiteboard/commands/context";
import { planReroute } from "@/features/whiteboard/commands/connectors";
import { validateBoard } from "../validate";

import type { CommandContext } from "@/features/whiteboard/commands/context";
import { labelOf } from "@/features/whiteboard/commands/connectors";
import type { Bounds, DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../errors";
import { SELECTION_TOKEN } from "../schemas";
import type { ToolEnv } from "../types";

const round = (n: number) => Math.round(n * 10) / 10;

export const bounds = (ctx: CommandContext, shape: DrawingElement): Bounds | null => ctx.getBounds(shape);

export const shortText = (value: string | undefined, max = 80) => (value === undefined ? undefined : value.length > max ? `${value.slice(0, max)}…` : value);

/** What a model needs to recognise and place an element: kept small, because every call repeats it. */
export interface ElementSummary {
  id: string;
  type: string;
  label?: string;
  text?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  icon?: string;
  group?: string;
  locked?: true;
  hidden?: true;
  from?: string;
  to?: string;
  fromSide?: string;
  toSide?: string;
  connectorLabel?: string;
  routing?: string;
  rotation?: number;
}

const sideOf = (anchorId: string | undefined) => (anchorId ? anchorId.split("-").pop() : undefined);

export const summarize = (ctx: CommandContext, shape: DrawingElement): ElementSummary => {
  const out: ElementSummary = { id: shape.id, type: shape.type };
  const b = bounds(ctx, shape);
  if (b && !isArrowElement(shape)) Object.assign(out, { x: round(b.minX), y: round(b.minY), w: round(b.width), h: round(b.height) });
  if (typeof shape.label === "string" && shape.label !== "") out.label = shortText(shape.label);
  if (shape.type === "text" && typeof shape.text === "string") out.text = shortText(shape.text);
  if (shape.type === "semantic-node" || shape.type === "icon") out.icon = iconForNode(shape.ai).id;
  const parent = ctx.index.parentOf.get(shape.id);
  if (parent) out.group = parent;
  if (isEffectivelyLocked(ctx.index, shape.id)) out.locked = true;
  if (isHiddenByFlag(ctx.index, shape.id)) out.hidden = true;
  if (typeof shape.rotation === "number" && shape.rotation % 360 !== 0) out.rotation = round(shape.rotation);
  if (isArrowElement(shape)) {
    out.from = shape.startConnection?.elementId;
    out.to = shape.endConnection?.elementId;
    out.fromSide = sideOf(shape.startConnection?.anchorId);
    out.toSide = sideOf(shape.endConnection?.anchorId);
    out.routing = shape.routingMode ?? "orthogonal";
    const label = labelOf(ctx, shape);
    if (label?.text) out.connectorLabel = shortText(label.text, 60);
  }
  return out;
};

export interface ResolvedTargets {
  /** Shape ids (a group id expands to its shapes), de-duplicated, in the order given. */
  shapeIds: string[];
  /** Group ids that were named (so a tool can treat them as units). */
  groupIds: string[];
}

/**
 * Turns the ids a model gave into shapes that exist. `"@selection"` is the editor's selection; a group id
 * stands for every shape in it. Anything unknown stops the call with `not_found` and the ids that failed,
 * so nothing is ever applied to a guess.
 */
export const resolveTargets = (env: ToolEnv, ids: readonly string[], { allowGroups = true }: { allowGroups?: boolean } = {}): ResolvedTargets => {
  const { ctx, host } = env;
  const expanded: string[] = [];
  for (const id of ids) {
    if (id === SELECTION_TOKEN) {
      const selection = host.getSelection();
      if (selection.length === 0) throw new ToolError("not_found", `"${SELECTION_TOKEN}" was used but nothing is selected. Pass explicit ids or select something first.`);
      expanded.push(...selection);
    } else expanded.push(id);
  }
  const unknown = expanded.filter((id) => !ctx.index.shapes.has(id) && !ctx.index.groups.has(id));
  if (unknown.length > 0) throw new ToolError("not_found", `No element with id ${unknown.slice(0, 8).map((id) => `"${id}"`).join(", ")}${unknown.length > 8 ? ` (+${unknown.length - 8} more)` : ""}. Use find_elements or get_document_state to get current ids.`, { ids: unknown });
  const shapeIds = new Set<string>();
  const groupIds: string[] = [];
  for (const id of expanded) {
    if (ctx.index.groups.has(id)) {
      if (!allowGroups) throw new ToolError("invalid_state", `"${id}" is a group; this tool needs individual elements.`, { ids: [id] });
      groupIds.push(id);
      for (const leaf of ctx.index.leavesOf.get(id) ?? []) shapeIds.add(leaf);
    } else shapeIds.add(id);
  }
  return { shapeIds: [...shapeIds], groupIds };
};

/**
 * Splits `ids` into what can be edited and what is locked. Locked elements stop the call unless the caller
 * said to skip them; skipped ones are reported back so the model knows they were left alone.
 */
export const requireEditable = (ctx: CommandContext, ids: readonly string[], { skipLocked }: { skipLocked?: boolean } = {}) => {
  const locked = ids.filter((id) => isEffectivelyLocked(ctx.index, id));
  if (locked.length > 0 && !skipLocked) {
    throw new ToolError("locked", `${locked.length} element(s) are locked and were not changed: ${locked.slice(0, 8).join(", ")}. Unlock them (unlock_elements) or pass skip_locked: true to leave them out.`, { ids: locked });
  }
  const lockedSet = new Set(locked);
  return { editable: ids.filter((id) => !lockedSet.has(id)), skipped: locked.map((id) => ({ id, reason: "locked" })) };
};

/** Shapes a unit-based command (align, group, layout) works on, with locked ones kept as references. */
export const unitsOf = (ctx: CommandContext, shapeIds: readonly string[]) => selectionUnits(ctx.index, selectedShapeIds(ctx.index, shapeIds));

export const groupName = (ctx: CommandContext, groupId: string) => {
  const record = ctx.index.groups.get(groupId);
  return record ? groupLabel(record) : groupId;
};

export const groupChain = (ctx: CommandContext, id: string) => ancestorsOf(ctx.index, id);

export { expandUnits, selectedShapeIds, selectionUnits };

export const count = (n: number, noun: string, plural = `${noun}s`) => `${n} ${n === 1 ? noun : plural}`;

/** `"a, b, c"` of the first few ids, for summaries. */
export const listIds = (ids: readonly string[], max = 6) => `${ids.slice(0, max).join(", ")}${ids.length > max ? ` (+${ids.length - max} more)` : ""}`;

// ── shared pieces of the mutating tools ───────────────────────────────────────────────────────────


/**
 * An icon from the registry by id or alias. A fuzzy guess is never applied silently: an unknown name is
 * an error that lists the closest real ids, so the model picks one instead of the board getting "generic".
 */
export const resolveIcon = (reference: string): IconDef => {
  const id = resolveIconId(reference);
  if (id) return getIcon(id);
  const near = searchIcons(reference, 5).map((match) => match.id);
  throw new ToolError("not_found", `There is no icon "${reference}".${near.length > 0 ? ` Closest: ${near.join(", ")}.` : ""} Use search_icons to find an id.`, { details: { suggestions: near } });
};

/** `second` planned on top of `first` (it ran against the board `first` produces): later versions of an element win. */
export const mergePatches = (first: DocPatch, second: DocPatch): DocPatch => {
  const update = new Map<string, StoredElement>();
  for (const item of first.update) update.set(item.id, item);
  for (const item of second.update) update.set(item.id, item);
  const add = new Map<string, StoredElement>();
  for (const item of first.add) add.set(item.id, item);
  for (const item of second.add) add.set(item.id, item);
  for (const [id, item] of update) if (add.has(id)) {
    add.set(id, item);
    update.delete(id);
  }
  const remove = [...new Set([...first.remove, ...second.remove])];
  const order = second.order ?? first.order;
  return { add: [...add.values()], update: [...update.values()], remove, ...(order ? { order } : {}) } as DocPatch;
};

/** A command context over the board as `patch` leaves it: for a tool whose second step needs the result of its first. */
/**
 * After a change that moves shapes, bring connectors whose ends floated off their shapes back, then name any
 * that still cross a shape or lead nowhere, so a layout or move can never report success over a broken diagram.
 */
export const settleConnectors = (env: ToolEnv, patch: DocPatch | null): { patch: DocPatch | null; warnings: string[] } => {
  if (!patch) return { patch, warnings: [] };
  let ctx = deriveContext(env, patch);
  let result = patch;
  const stale = validateBoard(ctx).find((issue) => issue.code === "stale_connector");
  if (stale) {
    const fixed = planReroute(ctx, stale.ids, { forgetManual: true }).patch;
    if (fixed) {
      result = mergePatches(patch, fixed);
      ctx = deriveContext(env, result);
    }
  }
  const warnings = validateBoard(ctx)
    .filter((issue) => issue.code === "stale_connector" || issue.code === "connector_through_node" || issue.code === "connector_through_heading" || issue.code === "dangling_connector")
    .map((issue) => `${issue.ids.length} connector${issue.ids.length === 1 ? "" : "s"} (${issue.ids.slice(0, 6).join(", ")}) ${issue.code === "connector_through_node" ? "run through a shape" : issue.code === "connector_through_heading" ? "run through a frame heading (fit_frame moves it clear)" : issue.code === "stale_connector" ? "do not reach their shapes" : "point at missing shapes"}: fix with reroute_connector or move the shapes before saying the diagram is tidy.`);
  return { patch: result, warnings };
};

export const deriveContext = (env: ToolEnv, patch: DocPatch) =>
  createCommandContext(applyPatch(env.ctx.stored, patch), { newId: env.ctx.newId, getBounds: env.host.getBounds });

/**
 * The top-left corner for something new when the caller gave no position: beside the existing content,
 * level with its top (or near the visible corner of an empty board), so a new element never lands on one.
 */
export const defaultOrigin = (env: ToolEnv, gap = 64): { x: number; y: number } => {
  const { ctx, host } = env;
  const box = unionBounds(ctx.shapes.flatMap((shape) => (shape.isGuide ? [] : (ctx.getBounds(shape) ?? []))));
  if (box) return { x: Math.round(box.maxX + gap), y: Math.round(box.minY) };
  const view = host.getViewport();
  if (view && view.zoom > 0) return { x: Math.round(-view.pan.x / view.zoom + 80), y: Math.round(-view.pan.y / view.zoom + 80) };
  return { x: 80, y: 80 };
};

/** An id the caller chose must not already be on the board; otherwise one is made. */
export const claimId = (env: ToolEnv, wanted: string | undefined): string => {
  if (wanted === undefined) {
    let id = env.ctx.newId();
    while (env.ctx.index.shapes.has(id) || env.ctx.index.groups.has(id)) id = env.ctx.newId();
    return id;
  }
  if (env.ctx.index.shapes.has(wanted) || env.ctx.index.groups.has(wanted)) {
    throw new ToolError("conflict", `The id "${wanted}" is already used by an element on the board. Choose another id or leave it out.`, { ids: [wanted] });
  }
  return wanted;
};

/** A failed command ({reason, id}) as the error a model can act on. */
export const failureError = (failure: { reason: string; id: string }): ToolError => {
  const messages: Record<string, [ConstructorParameters<typeof ToolError>[0], string]> = {
    missing: ["not_found", `"${failure.id}" is not on the board.`],
    not_connectable: ["unsupported", `"${failure.id}" cannot be connected (text, lines, connectors and frames have no connection points).`],
    no_anchor: ["unsupported", `"${failure.id}" has no connection point on that side.`],
    same_element: ["invalid_state", `A connector needs two different elements; "${failure.id}" was given twice.`],
    no_bounds: ["invalid_state", `"${failure.id}" has no size yet and cannot be connected.`],
    not_a_connector: ["invalid_state", `"${failure.id}" is not a connector.`],
    locked: ["locked", `"${failure.id}" is locked. Unlock it first (unlock_elements).`],
  };
  const [code, message] = messages[failure.reason] ?? ["invalid_state", `${failure.reason} (${failure.id}).`];
  return new ToolError(code, message, { ids: [failure.id] });
};

/** Shapes a patch may not touch because they are locked, as skipped entries. */
export const lockedSkips = (ids: readonly string[]) => ids.map((id) => ({ id, reason: "locked" }));

/** Whether a label (text inside, or a caption under an icon) can be set on this shape. */
export const canHoldLabel = (shape: DrawingElement): boolean =>
  !isArrowElement(shape) && (shape.type === "icon" || getShapeDefinition(shape.type)?.labelConfig?.anchor === "center");

/** Shapes a box would land on (frames, labels and connectors do not count), as a warning a model can act on. */
export const overlapWarnings = (env: ToolEnv, box: { x: number; y: number; width: number; height: number }, ignoreId?: string): string[] => {
  const hit: string[] = [];
  for (const shape of env.ctx.shapes) {
    if (shape.id === ignoreId || shape.isGuide || shape.type === "text" || isArrowElement(shape)) continue;
    const other = env.ctx.getBounds(shape);
    if (!other) continue;
    if (box.x < other.maxX && other.minX < box.x + box.width && box.y < other.maxY && other.minY < box.y + box.height) hit.push(`"${shape.label ?? shape.id}" (${shape.id})`);
  }
  if (hit.length === 0) return [];
  return [`The new element overlaps ${hit.slice(0, 4).join(", ")}${hit.length > 4 ? " and more" : ""}. Move it, or make room first with move_elements / tidy_diagram, then reconnect.`];
};

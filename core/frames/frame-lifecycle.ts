import { buildFrameIndex, commonFrame, frameAncestors, frameDescendants } from "./frame-index";
import { buildGroupIndex } from "@/core/groups/group-index";
import { planDelete } from "@/core/groups/group-commands";
import { applyPatch, isEmptyPatch } from "@/core/groups/patch";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { Bounds, FrameShape, StoredElement } from "@/core/model";
import { fitsDepth } from "./containment";
import { FRAME_DEFAULTS, enforceMinimumSize, frameBox, resolveFrame, withBox } from "./frame-model";
import {
  applyChanges,
  boundsOf,
  fail,
  fitBoxAround,
  framesAbove,
  isFailure,
  lockedBy,
  lookupFrame,
  refit,
  sameBox,
  validBox,
  Working,
  type FrameChanges,
  type FrameFailure,
  type FrameResult,
  type FrameStyleInput,
} from "./frame-common";
import {
  assignToFrame,
  combine,
  resolveTargets,
  stepEach,
  type ManyResult,
} from "./frame-hierarchy";

export interface CreateFrameInput {
  /** The new frame's id; must be unused. */
  id: string;
  /** The frame's box in world units. Grown to the minimum size when smaller. */
  box: Bounds;
  title?: string;
  style?: FrameStyleInput;
  /** Frame to create it in (null = top level). */
  parent?: string | null;
  /** Take over the elements whose centre lies inside the box and that share the new frame's parent. */
  adopt?: boolean;
}

const centerOfBox = (b: Bounds) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const insideBox = (box: Bounds, b: Bounds) => {
  const c = centerOfBox(b);
  return c.x >= box.minX && c.x <= box.maxX && c.y >= box.minY && c.y <= box.maxY;
};

export const createFrame = (stored: readonly StoredElement[], input: CreateFrameInput): FrameResult<{ frameId: string; adopted: string[] }> => {
  if (typeof input.id !== "string" || input.id.trim() === "") return fail("invalid", "A frame needs an id.");
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  if (stored.some((item) => item.id === input.id)) return fail("exists", `An element with id "${input.id}" already exists.`);
  if (!validBox(input.box)) return fail("invalid", "The frame's box must have finite corners and a positive width and height.");
  const parent = input.parent ?? null;
  if (parent !== null) {
    const target = lookupFrame(index, parent);
    if (isFailure(target)) return target;
    if (lockedBy(groups, parent)) return fail("locked", `Frame "${parent}" is locked.`);
    if (!fitsDepth(index, input.id, parent)) return fail("too_deep", "Frames can be nested only a few levels deep.");
  }

  const base: FrameShape = {
    id: input.id,
    type: "frame",
    points: [
      { x: input.box.minX, y: input.box.minY },
      { x: input.box.maxX, y: input.box.maxY },
    ],
    color: "#64748b",
    strokeWidth: FRAME_DEFAULTS.strokeWidth,
    ...(parent ? { frameId: parent } : {}),
  };
  // New frames carry their title on a tab above the border; frames saved before keep the inside header they were drawn with.
  const styled = applyChanges(base, { titlePlacement: "above", ...(input.style ?? {}), title: input.title });
  if (isFailure(styled)) return styled;
  let frame = withBox(styled, enforceMinimumSize(styled, input.box));

  // Adoption: connectors go with both of their ends, everything else by its centre.
  const claimed = new Set<string>();
  if (input.adopt) {
    const box = frameBox(frame)!;
    const candidates = [...index.shapes.values()].filter((shape) => (index.parentOf.get(shape.id) ?? null) === parent && !lockedBy(groups, shape.id));
    for (const shape of candidates) {
      const bounds = boundsOf(shape);
      if (!isArrowElement(shape) && bounds && insideBox(box, bounds)) claimed.add(shape.id);
    }
    for (const shape of candidates) {
      if (!isArrowElement(shape)) continue;
      const ends = [shape.startConnection?.elementId, shape.endConnection?.elementId].filter((end): end is string => !!end);
      const bounds = boundsOf(shape);
      if (ends.length === 2 ? ends.every((end) => claimed.has(end)) : !!bounds && insideBox(box, bounds)) claimed.add(shape.id);
    }
    if (resolveFrame(frame).autoFit) {
      const fitted = fitBoxAround(frame, [...claimed].flatMap((id) => boundsOf(index.shapes.get(id)) ?? []));
      if (fitted) frame = withBox(frame, fitted);
    }
  }

  const work = new Working(stored, index);
  for (const id of claimed) work.assign(id, { frameId: frame.id });
  const patch = work.patch({ add: [frame] });
  return { ok: true, patch, frameId: frame.id, adopted: [...claimed] };
};

/** Changes a frame's title or look. An auto-fit frame is re-fitted when the change affects its size. */
export const updateFrame = (stored: readonly StoredElement[], id: string, changes: FrameChanges): FrameResult<{ changed: boolean }> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  const frame = lookupFrame(index, id);
  if (isFailure(frame)) return frame;
  if (lockedBy(groups, id)) return fail("locked", `Frame "${id}" is locked.`);
  const next = applyChanges(frame, changes);
  if (isFailure(next)) return next;

  const work = new Working(stored, index);
  work.set(next);
  const resized = changes.padding !== undefined || changes.titlePlacement !== undefined || changes.headerVisible !== undefined || changes.autoFit !== undefined;
  const sizeLimits = changes.minWidth !== undefined || changes.minHeight !== undefined;
  if (resized) refit(work, [id], changes.autoFit === true ? new Set([id]) : new Set());
  if (sizeLimits && !resolveFrame(next).autoFit) {
    const current = work.get(id) as FrameShape;
    const box = frameBox(current);
    if (box) {
      const grown = enforceMinimumSize(current, box);
      if (!sameBox(grown, box)) work.set(withBox(current, grown));
    }
  }
  const sizeChanged = !sameBox(frameBox(work.get(id) as FrameShape), frameBox(frame));
  if (sizeChanged) refit(work, framesAbove(index, [id]));
  const patch = work.patch();
  return { ok: true, patch, changed: !isEmptyPatch(patch) && JSON.stringify(work.get(id)) !== JSON.stringify(frame) };
};

export const renameFrame = (stored: readonly StoredElement[], id: string, title: string): FrameResult<{ changed: boolean }> => updateFrame(stored, id, { title });

/** `updateFrame` for several frames at once (the properties bar): one patch, locked and unchanged frames skipped and reported. */
export const updateFrames = (stored: readonly StoredElement[], ids: readonly string[], changes: FrameChanges): FrameResult<ManyResult> => stepEach(stored, ids, (current, id) => updateFrame(current, id, changes));

export interface FrameSelectionInput {
  id: string;
  title?: string;
  /** Overrides the padding of the new frame (and its style). */
  padding?: number;
  style?: FrameStyleInput;
}

/**
 * Wraps the selected elements in a new frame: sized to hold them plus padding and header, owned by
 * the nearest frame that already holds all of them (top level otherwise), and owning them. Groups in
 * the selection count as one unit; elements inside a selected frame ride with that frame. Nothing moves.
 */
export const frameSelection = (stored: readonly StoredElement[], selected: readonly string[], input: FrameSelectionInput): FrameResult<{ frameId: string; selection: string[] }> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  if (stored.some((item) => item.id === input.id)) return fail("exists", `An element with id "${input.id}" already exists.`);
  const leaves = resolveTargets(index, groups, selected).targets.filter((id) => !lockedBy(groups, id));
  const set = new Set(leaves);
  const owners = leaves.filter((id) => !frameAncestors(index, id).some((ancestor) => set.has(ancestor)));
  if (owners.length === 0) return fail("not_found", "There is nothing selected that can be framed.");
  const parent = commonFrame(index, owners);
  if (parent !== null && (lockedBy(groups, parent) || !fitsDepth(index, input.id, parent))) {
    return fail(lockedBy(groups, parent) ? "locked" : "too_deep", lockedBy(groups, parent) ? `Frame "${parent}" is locked.` : "Frames can be nested only a few levels deep.");
  }
  for (const id of owners) if (!fitsDepth(index, id, input.id)) return fail("too_deep", "Frames can be nested only a few levels deep.");

  const bounds = owners.flatMap((id) => boundsOf(index.shapes.get(id)) ?? []);
  const draft = applyChanges({ id: input.id, type: "frame", points: [], color: "#64748b", strokeWidth: FRAME_DEFAULTS.strokeWidth } as FrameShape, {
    ...(input.style ?? {}),
    ...(input.padding !== undefined ? { padding: input.padding } : {}),
  });
  if (isFailure(draft)) return draft;
  const box = fitBoxAround(draft, bounds);
  if (!box) return fail("invalid", "The selected elements have no measurable bounds.");
  const created = createFrame(stored, { id: input.id, box, title: input.title, parent, style: { ...(input.style ?? {}), ...(input.padding !== undefined ? { padding: input.padding } : {}) } });
  if (!created.ok) return created;
  const owned = assignToFrame(applyPatch(stored, created.patch), input.id, owners);
  if (!owned.ok) return owned;
  return { ok: true, patch: combine(stored, [created.patch, owned.patch]), frameId: input.id, selection: [input.id] };
};

export type DeleteContents = "delete" | "release";

/**
 * Removes a frame. `release` keeps what it owned (it goes up into the frame's own owner, or the
 * canvas); `delete` removes the contents too, with the connectors attached to them and any group left
 * empty. Refuses when the frame, or (for `delete`) anything it owns, is locked.
 */
export const deleteFrame = (stored: readonly StoredElement[], id: string, options: { contents: DeleteContents }): FrameResult<{ removed: string[] }> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  const frame = lookupFrame(index, id);
  if (isFailure(frame)) return frame;
  if (lockedBy(groups, id)) return fail("locked", `Frame "${id}" is locked.`);
  if (options.contents === "release") {
    const parent = index.parentOf.get(id);
    const work = new Working(stored, index);
    for (const child of index.childrenOf.get(id) ?? []) work.assign(child, { frameId: parent });
    const patch = work.patch({ remove: [id] });
    return { ok: true, patch, removed: [id] };
  }
  const owned = frameDescendants(index, id);
  const locked = owned.filter((own) => lockedBy(groups, own));
  if (locked.length > 0) return fail("locked", `Frame "${id}" cannot be deleted: ${locked.length === 1 ? `"${locked[0]}" is` : `${locked.length} elements are`} locked.`);
  const patch = planDelete(stored, [id, ...owned]);
  if (!patch) return fail("not_found", `Nothing to delete for "${id}".`);
  return { ok: true, patch, removed: patch.remove };
};

export interface FrameContentItem {
  id: string;
  type: string;
  /** 0 = directly in the frame. */
  depth: number;
}

/** What a frame owns, in stacking order. `deep` includes the contents of nested frames. */
export const listFrameContents = (stored: readonly StoredElement[], frameId: string, options: { deep?: boolean } = {}): { ok: true; items: FrameContentItem[] } | FrameFailure => {
  const index = buildFrameIndex(stored);
  const frame = lookupFrame(index, frameId);
  if (isFailure(frame)) return frame;
  const base = index.depthOf.get(frameId) ?? 0;
  const ids = options.deep ? frameDescendants(index, frameId) : [...(index.childrenOf.get(frameId) ?? [])];
  return { ok: true, items: ids.map((id) => ({ id, type: index.shapes.get(id)!.type, depth: (index.depthOf.get(id) ?? 0) - base - 1 })) };
};

export interface FrameSummary {
  id: string;
  title: string;
  parent: string | null;
  depth: number;
  box: Bounds | null;
  /** Direct children, frames and shapes. */
  children: number;
  autoFit: boolean;
  locked: boolean;
}

/** Every frame on the board, outermost first then in stacking order. */
export const listFrames = (stored: readonly StoredElement[]): FrameSummary[] => {
  const index = buildFrameIndex(stored);
  return [...index.frames.values()]
    .sort((a, b) => (index.depthOf.get(a.id) ?? 0) - (index.depthOf.get(b.id) ?? 0) || index.order.get(a.id)! - index.order.get(b.id)!)
    .map((frame) => ({
      id: frame.id,
      title: resolveFrame(frame).title,
      parent: index.parentOf.get(frame.id) ?? null,
      depth: index.depthOf.get(frame.id) ?? 0,
      box: frameBox(frame),
      children: index.childrenOf.get(frame.id)?.length ?? 0,
      autoFit: resolveFrame(frame).autoFit,
      locked: frame.locked === true,
    }));
};


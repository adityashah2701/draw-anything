import { buildFrameIndex, commonFrame, frameAncestors, isInsideFrame, type FrameIndex } from "./frame-index";
import { buildGroupIndex, type GroupIndex } from "@/core/groups/group-index";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { StoredElement } from "@/core/model";
import { frameForBounds, fitsDepth, orderFramesBelowContents } from "./containment";
import {
  boundsOf,
  diffUpdate,
  fail,
  framesAbove,
  isFailure,
  lockedBy,
  lookupFrame,
  refit,
  Working,
  type FrameErrorCode,
  type FrameResult,
  type SkipReason,
  type Skipped,
} from "./frame-common";

/** Ids a caller named, with groups turned into the shapes inside them and ids that ride with an already-named frame dropped. */
export const resolveTargets = (index: FrameIndex, groups: GroupIndex, ids: readonly string[]): { targets: string[]; skipped: Skipped[] } => {
  const skipped: Skipped[] = [];
  const known: string[] = [];
  for (const id of ids) {
    if (groups.groups.has(id)) known.push(...(groups.leavesOf.get(id) ?? []));
    else if (index.shapes.has(id)) known.push(id);
    else skipped.push({ id, reason: "not_found" });
  }
  const unique = [...new Set(known)];
  const set = new Set(unique);
  // An element inside a frame that is itself named rides with that frame.
  const targets = unique.filter((id) => !frameAncestors(index, id).some((ancestor) => set.has(ancestor)));
  return { targets, skipped };
};

export interface OwnershipResult {
  /** Elements whose owner changed. */
  changed: string[];
  skipped: Skipped[];
}

/** The patch for two successive working copies (ownership first, then re-fit), as one patch against `stored`. */
export const mergeWork = (stored: readonly StoredElement[], first: Working, second: Working): DocPatch => {
  const ids = new Set<string>([...first.patch().update.map((u) => u.id), ...second.patch().update.map((u) => u.id)]);
  const final = new Map<string, StoredElement>();
  for (const update of first.patch().update) final.set(update.id, update);
  for (const update of second.patch().update) final.set(update.id, update);
  const patch: DocPatch = { add: [], update: [...ids].map((id) => final.get(id)!), remove: [] };
  const order = orderFramesBelowContents(applyPatch(stored, patch));
  if (order) patch.order = order;
  return patch;
};

/**
 * Makes `frameId` (null = top level) the owner of `ids`. Groups stand for the shapes inside them.
 * Nothing moves on the canvas. Refuses to put a frame inside itself or its own contents, beyond the
 * nesting limit, or into a locked frame; locked elements and unknown ids are skipped and reported.
 */
export const assignToFrame = (stored: readonly StoredElement[], frameId: string | null, ids: readonly string[]): FrameResult<OwnershipResult> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  if (frameId !== null) {
    const frame = lookupFrame(index, frameId);
    if (isFailure(frame)) return frame;
    if (lockedBy(groups, frameId)) return fail("locked", `Frame "${frameId}" is locked.`);
  }
  const { targets, skipped } = resolveTargets(index, groups, ids);
  const work = new Working(stored, index);
  const changed: string[] = [];
  const previousParents = new Set<string>();
  for (const id of targets) {
    if (id === frameId || (frameId !== null && isInsideFrame(index, frameId, id))) {
      return fail("cycle", `A frame cannot be placed inside itself or inside something it owns ("${id}").`);
    }
    if (!fitsDepth(index, id, frameId)) return fail("too_deep", "Frames can be nested only a few levels deep.");
  }
  for (const id of targets) {
    if (lockedBy(groups, id)) {
      skipped.push({ id, reason: "locked" });
      continue;
    }
    if ((index.parentOf.get(id) ?? null) === frameId) {
      skipped.push({ id, reason: "unchanged" });
      continue;
    }
    const previous = index.parentOf.get(id);
    if (previous) previousParents.add(previous);
    work.assign(id, { frameId: frameId ?? undefined });
    changed.push(id);
  }
  const affected = new Set<string>([...previousParents, ...(frameId ? [frameId] : [])]);
  const rebuilt = buildFrameIndex(work.patch().update.length ? applyPatch(stored, work.patch()) : stored);
  const refitWork = new Working(applyPatch(stored, work.patch()), rebuilt);
  refit(refitWork, [...affected, ...framesAbove(rebuilt, changed), ...framesAbove(index, changed)]);
  return { ok: true, patch: mergeWork(stored, work, refitWork), changed, skipped };
};

export const addToFrame = (stored: readonly StoredElement[], frameId: string, ids: readonly string[]): FrameResult<OwnershipResult> => assignToFrame(stored, frameId, ids);

/** Sequential patches (each made against the result of the one before) as a single patch against `stored`. */
export const combine = (stored: readonly StoredElement[], patches: readonly DocPatch[]): DocPatch => {
  let list = stored;
  for (const patch of patches) list = applyPatch(list, patch);
  const before = new Map(stored.map((item) => [item.id, item]));
  const after = new Map(list.map((item) => [item.id, item]));
  const out: DocPatch = { add: [], update: [], remove: [] };
  for (const [id, item] of after) {
    if (!before.has(id)) out.add.push(item);
    else {
      const entry = diffUpdate(before.get(id), item);
      if (entry) out.update.push(entry);
    }
  }
  for (const id of before.keys()) if (!after.has(id)) out.remove.push(id);
  const order = list.map((item) => item.id);
  if (order.some((id, i) => stored[i]?.id !== id)) out.order = order;
  return out;
};

/**
 * Takes `ids` out of their frames. By default each goes up one level (into the frame that owned its
 * frame); `toTopLevel` puts them on the canvas. Elements that are not in a frame are skipped.
 */
export const removeFromFrame = (stored: readonly StoredElement[], ids: readonly string[], options: { toTopLevel?: boolean } = {}): FrameResult<OwnershipResult> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  const { targets, skipped } = resolveTargets(index, groups, ids);
  const byDestination = new Map<string | null, string[]>();
  for (const id of targets) {
    const current = index.parentOf.get(id);
    if (current === undefined) {
      skipped.push({ id, reason: "unchanged" });
      continue;
    }
    if (lockedBy(groups, current)) {
      skipped.push({ id, reason: "locked" });
      continue;
    }
    const destination = options.toTopLevel ? null : (index.parentOf.get(current) ?? null);
    byDestination.set(destination, [...(byDestination.get(destination) ?? []), id]);
  }
  let working = stored;
  const changed: string[] = [];
  const patches: DocPatch[] = [];
  for (const [destination, group] of byDestination) {
    const result = assignToFrame(working, destination, group);
    if (!result.ok) return result;
    patches.push(result.patch);
    working = applyPatch(working, result.patch);
    changed.push(...result.changed);
    skipped.push(...result.skipped);
  }
  return { ok: true, patch: combine(stored, patches), changed, skipped };
};

export interface ManyResult {
  /** Frames that changed. */
  changed: string[];
  /** Frames left alone, with why (locked, not a frame, nothing to change). */
  skipped: Skipped[];
}

const SKIP_BY_CODE: Partial<Record<FrameErrorCode, SkipReason>> = { not_found: "not_found", not_a_frame: "not_found", locked: "locked" };

/** Runs `step` for each id against the board as the earlier steps left it, and returns one combined patch. */
export const stepEach = (stored: readonly StoredElement[], ids: readonly string[], step: (current: readonly StoredElement[], id: string) => FrameResult<{ changed: boolean }>): FrameResult<ManyResult> => {
  const patches: DocPatch[] = [];
  const changed: string[] = [];
  const skipped: Skipped[] = [];
  let current = stored;
  for (const id of [...new Set(ids)]) {
    const result = step(current, id);
    if (!result.ok) {
      const reason = SKIP_BY_CODE[result.code];
      if (!reason) return result;
      skipped.push({ id, reason });
    } else if (!result.changed) skipped.push({ id, reason: "unchanged" });
    else {
      patches.push(result.patch);
      current = applyPatch(current, result.patch);
      changed.push(id);
    }
  }
  return { ok: true, patch: combine(stored, patches), changed, skipped };
};

/** Puts frame `childId` inside `parentId`, or on the canvas when `parentId` is null. */
export const nestFrame = (stored: readonly StoredElement[], childId: string, parentId: string | null): FrameResult<OwnershipResult> => {
  const index = buildFrameIndex(stored);
  const child = lookupFrame(index, childId);
  if (isFailure(child)) return child;
  return assignToFrame(stored, parentId, [childId]);
};

/**
 * After `moved` elements have been dragged to their new place in `stored`, decides which frame owns
 * each: the deepest unlocked frame holding its centre. Elements inside a moved frame keep their
 * owner. Connectors with both ends attached follow the nearest frame that owns both ends. Returns
 * null when nobody changes owner.
 */
export const reparentMoved = (stored: readonly StoredElement[], moved: readonly string[]): FrameResult<OwnershipResult> | null => {
  const index = buildFrameIndex(stored);
  if (index.frames.size === 0) return null;
  const groups = buildGroupIndex(stored);
  const movedSet = new Set(moved);
  const roots = moved.filter((id) => index.shapes.has(id) && !frameAncestors(index, id).some((ancestor) => movedSet.has(ancestor)) && !lockedBy(groups, id));
  const destination = new Map<string, string | null>();
  for (const id of roots) {
    const shape = index.shapes.get(id)!;
    if (isArrowElement(shape) && shape.startConnection?.elementId && shape.endConnection?.elementId) continue;
    const bounds = boundsOf(shape);
    if (!bounds) continue;
    const exclude = new Set<string>([...index.frames.keys()].filter((frame) => frame === id || isInsideFrame(index, frame, id) || lockedBy(groups, frame)));
    destination.set(id, frameForBounds(index, bounds, exclude));
  }
  const parentAfter = new Map(index.parentOf);
  for (const [id, to] of destination) {
    if (to === null) parentAfter.delete(id);
    else parentAfter.set(id, to);
  }
  for (const id of roots) {
    const shape = index.shapes.get(id)!;
    if (!isArrowElement(shape)) continue;
    const ends = [shape.startConnection?.elementId, shape.endConnection?.elementId];
    if (!ends[0] || !ends[1]) continue;
    destination.set(id, commonFrame({ parentOf: parentAfter }, ends as string[]));
  }
  const byDestination = new Map<string | null, string[]>();
  for (const [id, to] of destination) {
    if ((index.parentOf.get(id) ?? null) === to) continue;
    byDestination.set(to, [...(byDestination.get(to) ?? []), id]);
  }
  if (byDestination.size === 0) return null;
  let working = stored;
  const patches: DocPatch[] = [];
  const changed: string[] = [];
  const skipped: Skipped[] = [];
  for (const [to, ids] of byDestination) {
    const result = assignToFrame(working, to, ids);
    if (!result.ok) continue;
    patches.push(result.patch);
    working = applyPatch(working, result.patch);
    changed.push(...result.changed);
    skipped.push(...result.skipped);
  }
  if (changed.length === 0) return null;
  return { ok: true, patch: combine(stored, patches), changed, skipped };
};


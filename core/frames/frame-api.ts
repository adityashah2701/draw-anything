import { makeBounds, unionBounds } from "@/core/geometry/box";
import { buildGroupIndex, isEffectivelyLocked, type GroupIndex } from "@/core/groups/group-index";
import { planDelete } from "@/core/groups/group-commands";
import { applyPatch, emptyPatch, isEmptyPatch, type DocPatch } from "@/core/groups/patch";
import { getShapeBounds, moveShape } from "@/core/shapes/shape-runtime";
import { partitionConnectors } from "@/core/groups/transform";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { withInternalConnectors } from "@/features/whiteboard/utils/move-plan";
import type { Bounds, DrawingElement, FramePreset, FrameShape, FrameTitlePlacement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { frameForBounds, fitsDepth, orderFramesBelowContents } from "./containment";
import { buildFrameIndex, commonFrame, frameAncestors, frameDescendants, isInsideFrame, type FrameIndex } from "./frame-index";
import {
  FRAME_DEFAULTS,
  FRAME_PRESETS,
  MAX_FRAME_TITLE_LENGTH,
  enforceMinimumSize,
  frameBox,
  headerAllowance,
  resolveFrame,
  withBox,
} from "./frame-model";

/**
 * The one typed API for frames. Every function is pure: it reads the stored list and returns a
 * `DocPatch` (never writes), so a caller applies it as ONE storage mutation = one undo step. The
 * editor's tools, the keyboard and menus, the diagram-code language and the AI agent all go through
 * here, so a frame behaves the same whoever makes it.
 *
 * A function never throws on bad input: it returns `{ ok: false, code, message }`, where `message`
 * is written to be shown to a person or fed back to the agent.
 */

export type FrameErrorCode = "not_found" | "not_a_frame" | "locked" | "cycle" | "too_deep" | "invalid" | "auto_fit" | "exists";

export interface FrameFailure {
  ok: false;
  code: FrameErrorCode;
  message: string;
}
export type FrameResult<T extends object = object> = ({ ok: true; patch: DocPatch } & T) | FrameFailure;

const fail = (code: FrameErrorCode, message: string): FrameFailure => ({ ok: false, code, message });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validBox = (box: Bounds | undefined): box is Bounds =>
  !!box && finite(box.minX) && finite(box.minY) && finite(box.maxX) && finite(box.maxY) && box.maxX > box.minX && box.maxY > box.minY;

/** What a frame is drawn like. Every field is optional; `null` on an update clears an optional field. */
export interface FrameStyleInput {
  color?: string;
  fill?: string | null;
  strokeWidth?: number;
  opacity?: number;
  cornerRadius?: number;
  padding?: number;
  titlePlacement?: FrameTitlePlacement;
  headerVisible?: boolean;
  autoFit?: boolean;
  minWidth?: number;
  minHeight?: number;
  preset?: FramePreset | null;
}

export type FrameChanges = FrameStyleInput & { title?: string | null };

export type SkipReason = "not_found" | "locked" | "self" | "unchanged";
export interface Skipped {
  id: string;
  reason: SkipReason;
}

/**
 * The update entry that turns `before` into `after`: `after` with every key it dropped set to
 * `undefined` (the patch merge deletes a key only when the entry carries it as `undefined`). Null
 * when nothing differs.
 */
const diffUpdate = <T extends StoredElement>(before: T | undefined, after: T): T | null => {
  if (!before) return after;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const entry: Record<string, unknown> = { ...(after as unknown as Record<string, unknown>) };
  let differs = false;
  for (const key of keys) {
    const was = (before as unknown as Record<string, unknown>)[key];
    const now = (after as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    differs = true;
    if (now === undefined) entry[key] = undefined;
  }
  return differs ? (entry as unknown as T) : null;
};

// ── Working state ───────────────────────────────────────────────────────────

/** A scratch copy of the drawable elements that commands change; `patch()` reports only what differs. */
class Working {
  readonly elements: Map<string, DrawingElement>;
  private readonly touched = new Set<string>();
  constructor(
    readonly stored: readonly StoredElement[],
    readonly index: FrameIndex,
  ) {
    this.elements = new Map(index.shapes);
  }
  get(id: string) {
    return this.elements.get(id);
  }
  set(element: DrawingElement) {
    this.elements.set(element.id, element);
    this.touched.add(element.id);
  }
  assign(id: string, change: Partial<DrawingElement>) {
    const current = this.elements.get(id);
    if (current) this.set({ ...current, ...change } as DrawingElement);
  }
  /** The parent frame an element has after the changes made so far. */
  parentOf(id: string): string | undefined {
    const element = this.elements.get(id);
    const parent = element?.frameId;
    return typeof parent === "string" && this.elements.get(parent)?.type === "frame" ? parent : undefined;
  }
  patch(extra: Partial<DocPatch> = {}): DocPatch {
    const patch: DocPatch = { add: extra.add ?? [], update: [], remove: extra.remove ?? [] };
    for (const id of this.touched) {
      const element = this.elements.get(id);
      if (!element || patch.remove.includes(id) || patch.add.some((added) => added.id === id)) continue;
      const entry = diffUpdate(this.index.shapes.get(id), element);
      if (entry) patch.update.push(entry);
    }
    const order = orderFramesBelowContents(applyPatch(this.stored, patch));
    if (order) patch.order = order;
    return patch;
  }
}

const boundsOf = (element: DrawingElement | undefined): Bounds | null => (element ? getShapeBounds(element) : null);

/** The box a frame needs to hold `contents`: their union plus padding (and the header), at least the minimum size. */
const fitBoxAround = (frame: FrameShape, contents: readonly Bounds[]): Bounds | null => {
  const union = unionBounds(contents);
  if (!union) return null;
  const { padding } = resolveFrame(frame);
  return enforceMinimumSize(frame, makeBounds(union.minX - padding, union.minY - padding - headerAllowance(frame), union.maxX + padding, union.maxY + padding));
};

/** Smallest box for a frame around its direct children, or null when it owns none that can be measured. */
const contentBox = (work: Working, frame: FrameShape): Bounds | null => {
  const boxes: Bounds[] = [];
  for (const child of work.index.childrenOf.get(frame.id) ?? []) {
    const bounds = boundsOf(work.get(child));
    if (bounds) boxes.push(bounds);
  }
  return fitBoxAround(frame, boxes);
};

const sameBox = (a: Bounds | null, b: Bounds | null) => !!a && !!b && a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

/**
 * Re-fits the auto-fit frames among `frameIds`, deepest first so a frame sees the new size of the
 * frames inside it. `force` fits those frames even when they are not auto-fit (an explicit "fit to content").
 */
const refit = (work: Working, frameIds: Iterable<string>, force: ReadonlySet<string> = new Set()) => {
  const ids = [...new Set(frameIds)].sort((a, b) => (work.index.depthOf.get(b) ?? 0) - (work.index.depthOf.get(a) ?? 0));
  for (const id of ids) {
    const frame = work.get(id);
    if (!frame || frame.type !== "frame") continue;
    if (!force.has(id) && !resolveFrame(frame).autoFit) continue;
    const next = contentBox(work, frame);
    if (next && !sameBox(next, frameBox(frame))) work.set(withBox(frame, next));
  }
};

/** Frames whose size may depend on `changed`: every frame above it. */
const framesAbove = (index: FrameIndex, changed: Iterable<string>): string[] => {
  const out = new Set<string>();
  for (const id of changed) for (const ancestor of frameAncestors(index, id)) out.add(ancestor);
  return [...out];
};

const lockedBy = (groups: GroupIndex, id: string) => isEffectivelyLocked(groups, id);

const lookupFrame = (index: FrameIndex, id: string): FrameShape | FrameFailure => {
  const element = index.shapes.get(id);
  if (!element) return fail("not_found", `There is no element "${id}" on the board.`);
  if (element.type !== "frame") return fail("not_a_frame", `"${id}" is not a frame.`);
  return element;
};
const isFailure = (value: unknown): value is FrameFailure => typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;

// ── Styles ──────────────────────────────────────────────────────────────────

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Applies style input to a frame, validating every field. Returns the new frame, or why it cannot. */
const applyChanges = (frame: FrameShape, changes: FrameChanges): FrameShape | FrameFailure => {
  const next: Record<string, unknown> = { ...frame };
  const set = (key: string, value: unknown) => {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  };
  const number = (key: string, value: unknown, min: number, max: number): FrameFailure | null => {
    if (value === undefined) return null;
    if (!finite(value)) return fail("invalid", `${key} must be a finite number.`);
    set(key, clampNumber(value, min, max));
    return null;
  };

  if (changes.title !== undefined) {
    if (changes.title !== null && typeof changes.title !== "string") return fail("invalid", "title must be text.");
    const title = (changes.title ?? "").trim().slice(0, MAX_FRAME_TITLE_LENGTH);
    set("title", title || undefined);
  }
  if (changes.color !== undefined) {
    if (typeof changes.color !== "string" || changes.color.trim() === "") return fail("invalid", "color must be a colour string.");
    next.color = changes.color;
  }
  if (changes.fill !== undefined) {
    if (changes.fill !== null && typeof changes.fill !== "string") return fail("invalid", "fill must be a colour string or null.");
    set("fill", changes.fill === null || changes.fill === "" ? undefined : changes.fill);
  }
  for (const failure of [
    number("strokeWidth", changes.strokeWidth, 0, 20),
    number("opacity", changes.opacity, 0, 1),
    number("cornerRadius", changes.cornerRadius, 0, 200),
    number("padding", changes.padding, 0, 400),
    number("minWidth", changes.minWidth, 1, 10_000),
    number("minHeight", changes.minHeight, 1, 10_000),
  ]) {
    if (failure) return failure;
  }
  if (changes.titlePlacement !== undefined) {
    if (changes.titlePlacement !== "inside" && changes.titlePlacement !== "above") return fail("invalid", 'titlePlacement must be "inside" or "above".');
    next.titlePlacement = changes.titlePlacement;
  }
  if (changes.headerVisible !== undefined) {
    if (typeof changes.headerVisible !== "boolean") return fail("invalid", "headerVisible must be true or false.");
    set("headerVisible", changes.headerVisible ? undefined : false);
  }
  if (changes.autoFit !== undefined) {
    if (typeof changes.autoFit !== "boolean") return fail("invalid", "autoFit must be true or false.");
    set("autoFit", changes.autoFit ? true : undefined);
  }
  if (changes.preset !== undefined) {
    if (changes.preset !== null && !FRAME_PRESETS.includes(changes.preset)) return fail("invalid", `preset must be one of ${FRAME_PRESETS.join(", ")}.`);
    set("preset", changes.preset);
  }
  return next as unknown as FrameShape;
};

// ── Create ──────────────────────────────────────────────────────────────────

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
  const styled = applyChanges(base, { ...(input.style ?? {}), title: input.title });
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

// ── Update, rename ──────────────────────────────────────────────────────────

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

// ── Move, resize, fit ───────────────────────────────────────────────────────

export interface MoveFrameResult {
  /** Connectors that join something inside the frame to something outside it: the caller re-routes these. */
  reroute: string[];
  /** Every element the move carried (the frame, what it owns, and the connectors wholly inside). */
  moved: string[];
}

/**
 * Moves a frame and everything it owns by (dx, dy). Connectors with every attached end inside travel
 * with it and keep their shape; a connector that also touches something outside is listed in
 * `reroute` for the editor's router, never left detached. Refuses when anything inside is locked.
 */
export const moveFrame = (stored: readonly StoredElement[], id: string, dx: number, dy: number): FrameResult<MoveFrameResult> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  const frame = lookupFrame(index, id);
  if (isFailure(frame)) return frame;
  if (!finite(dx) || !finite(dy)) return fail("invalid", "dx and dy must be finite numbers.");
  const owned = [id, ...frameDescendants(index, id)];
  const locked = owned.filter((own) => lockedBy(groups, own));
  if (locked.length > 0) return fail("locked", `Frame "${id}" cannot move: ${locked.length === 1 ? `"${locked[0]}" is` : `${locked.length} elements are`} locked.`);
  if (dx === 0 && dy === 0) return { ok: true, patch: emptyPatch(), reroute: [], moved: [] };

  const origin = owned.map((own) => index.shapes.get(own)!);
  const carried = withInternalConnectors(origin, [...index.shapes.values()]);
  const { rigid, reroute } = partitionConnectors(carried);
  // A connector joined to something inside AND something outside is not carried: the router re-attaches it.
  const inside = new Set(owned);
  const carriedIds = new Set(carried.map((shape) => shape.id));
  const boundary = [...index.shapes.values()].filter(
    (shape) =>
      isArrowElement(shape) &&
      !carriedIds.has(shape.id) &&
      [shape.startConnection?.elementId, shape.endConnection?.elementId].some((end) => end !== undefined && inside.has(end)),
  );
  const work = new Working(stored, index);
  for (const shape of rigid) work.set(moveShape(shape, { x: dx, y: dy }));
  const patch = work.patch();
  return { ok: true, patch, reroute: [...reroute, ...boundary].map((connector) => connector.id), moved: rigid.map((shape) => shape.id) };
};

/** Sets a frame's box by hand. Contents stay where they are; ownership does not change. Refused for an auto-fit frame. */
export const resizeFrame = (stored: readonly StoredElement[], id: string, box: Bounds): FrameResult<{ box: Bounds }> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  const frame = lookupFrame(index, id);
  if (isFailure(frame)) return frame;
  if (lockedBy(groups, id)) return fail("locked", `Frame "${id}" is locked.`);
  if (resolveFrame(frame).autoFit) return fail("auto_fit", `Frame "${id}" fits its contents; turn auto-fit off to size it by hand.`);
  if (!validBox(box)) return fail("invalid", "The new box must have finite corners and a positive width and height.");
  const next = enforceMinimumSize(frame, box);
  const work = new Working(stored, index);
  if (!sameBox(next, frameBox(frame))) work.set(withBox(frame, next));
  refit(work, framesAbove(index, [id]));
  return { ok: true, patch: work.patch(), box: next };
};

/** Sizes a frame to wrap what it owns (plus its padding and header), then re-fits the auto-fit frames around it. An empty frame is left alone. */
export const fitFrameToContent = (stored: readonly StoredElement[], id: string): FrameResult<{ changed: boolean }> => {
  const index = buildFrameIndex(stored);
  const groups = buildGroupIndex(stored);
  const frame = lookupFrame(index, id);
  if (isFailure(frame)) return frame;
  if (lockedBy(groups, id)) return fail("locked", `Frame "${id}" is locked.`);
  const work = new Working(stored, index);
  refit(work, [id], new Set([id]));
  refit(work, framesAbove(index, [id]));
  const patch = work.patch();
  return { ok: true, patch, changed: !isEmptyPatch(patch) };
};

/**
 * Re-fits every auto-fit frame that `changed` elements affect (the editor calls this after a move or
 * resize has been applied) and the frames in `alsoFrames` (an element that left them). Returns null when nothing needs to change.
 */
export const planAutoFit = (stored: readonly StoredElement[], changed: readonly string[], alsoFrames: readonly string[] = []): DocPatch | null => {
  const index = buildFrameIndex(stored);
  if (index.frames.size === 0) return null;
  const work = new Working(stored, index);
  refit(work, [...framesAbove(index, changed), ...alsoFrames.filter((id) => index.frames.has(id))]);
  const patch = work.patch();
  return isEmptyPatch(patch) ? null : patch;
};

// ── Ownership: add, remove, nest ────────────────────────────────────────────

/** Ids a caller named, with groups turned into the shapes inside them and ids that ride with an already-named frame dropped. */
const resolveTargets = (index: FrameIndex, groups: GroupIndex, ids: readonly string[]): { targets: string[]; skipped: Skipped[] } => {
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

/** The patch for two successive working copies (ownership first, then re-fit), as one patch against `stored`. */
const mergeWork = (stored: readonly StoredElement[], first: Working, second: Working): DocPatch => {
  const ids = new Set<string>([...first.patch().update.map((u) => u.id), ...second.patch().update.map((u) => u.id)]);
  const final = new Map<string, StoredElement>();
  for (const update of first.patch().update) final.set(update.id, update);
  for (const update of second.patch().update) final.set(update.id, update);
  const patch: DocPatch = { add: [], update: [...ids].map((id) => final.get(id)!), remove: [] };
  const order = orderFramesBelowContents(applyPatch(stored, patch));
  if (order) patch.order = order;
  return patch;
};

export const addToFrame = (stored: readonly StoredElement[], frameId: string, ids: readonly string[]): FrameResult<OwnershipResult> => assignToFrame(stored, frameId, ids);

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

/** Sequential patches (each made against the result of the one before) as a single patch against `stored`. */
const combine = (stored: readonly StoredElement[], patches: readonly DocPatch[]): DocPatch => {
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

/** Puts frame `childId` inside `parentId`, or on the canvas when `parentId` is null. */
export const nestFrame = (stored: readonly StoredElement[], childId: string, parentId: string | null): FrameResult<OwnershipResult> => {
  const index = buildFrameIndex(stored);
  const child = lookupFrame(index, childId);
  if (isFailure(child)) return child;
  return assignToFrame(stored, parentId, [childId]);
};

// ── Reading ─────────────────────────────────────────────────────────────────

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

// ── Frame a selection ───────────────────────────────────────────────────────

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

// ── Re-parent after a drag ──────────────────────────────────────────────────

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

// ── Delete ──────────────────────────────────────────────────────────────────

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


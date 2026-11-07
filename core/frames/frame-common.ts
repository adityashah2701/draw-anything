import { makeBounds, unionBounds } from "@/core/geometry/box";
import { isEffectivelyLocked, type GroupIndex } from "@/core/groups/group-index";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { Bounds, DrawingElement, FragmentOperator, FramePreset, FrameShape, FrameTitlePlacement, StoredElement } from "@/core/model";
import { orderFramesBelowContents } from "./containment";
import { frameAncestors, type FrameIndex } from "./frame-index";
import {
  FRAME_PRESETS,
  MAX_FRAME_TITLE_LENGTH,
  enforceMinimumSize,
  frameBox,
  headerAllowance,
  resolveFrame,
  withBox,
} from "./frame-model";

export type FrameErrorCode = "not_found" | "not_a_frame" | "locked" | "cycle" | "too_deep" | "invalid" | "auto_fit" | "exists";

export interface FrameFailure {
  ok: false;
  code: FrameErrorCode;
  message: string;
}
export type FrameResult<T extends object = object> = ({ ok: true; patch: DocPatch } & T) | FrameFailure;

export const fail = (code: FrameErrorCode, message: string): FrameFailure => ({ ok: false, code, message });
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const validBox = (box: Bounds | undefined): box is Bounds =>
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
  /** Fragment operator (loop, alt, opt, par, break, neg, critical), and the fractions of the height where its sections divide. */
  operator?: FragmentOperator | null;
  dividers?: number[] | null;
  orientation?: "horizontal" | "vertical" | null;
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
export const diffUpdate = <T extends StoredElement>(before: T | undefined, after: T): T | null => {
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
export class Working {
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

export const boundsOf = (element: DrawingElement | undefined): Bounds | null => (element ? getShapeBounds(element) : null);

/** The box a frame needs to hold `contents`: their union plus padding (and the header), at least the minimum size. */
export const fitBoxAround = (frame: FrameShape, contents: readonly Bounds[]): Bounds | null => {
  const union = unionBounds(contents);
  if (!union) return null;
  const { padding } = resolveFrame(frame);
  return enforceMinimumSize(frame, makeBounds(union.minX - padding, union.minY - padding - headerAllowance(frame), union.maxX + padding, union.maxY + padding));
};

/** Smallest box for a frame around its direct children, or null when it owns none that can be measured. */
export const contentBox = (work: Working, frame: FrameShape): Bounds | null => {
  const boxes: Bounds[] = [];
  for (const child of work.index.childrenOf.get(frame.id) ?? []) {
    const bounds = boundsOf(work.get(child));
    if (bounds) boxes.push(bounds);
  }
  return fitBoxAround(frame, boxes);
};

export const sameBox = (a: Bounds | null, b: Bounds | null) => !!a && !!b && a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

/**
 * Re-fits the auto-fit frames among `frameIds`, deepest first so a frame sees the new size of the
 * frames inside it. `force` fits those frames even when they are not auto-fit (an explicit "fit to content").
 */
export const refit = (work: Working, frameIds: Iterable<string>, force: ReadonlySet<string> = new Set()) => {
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
export const framesAbove = (index: FrameIndex, changed: Iterable<string>): string[] => {
  const out = new Set<string>();
  for (const id of changed) for (const ancestor of frameAncestors(index, id)) out.add(ancestor);
  return [...out];
};

export const lockedBy = (groups: GroupIndex, id: string) => isEffectivelyLocked(groups, id);

export const lookupFrame = (index: FrameIndex, id: string): FrameShape | FrameFailure => {
  const element = index.shapes.get(id);
  if (!element) return fail("not_found", `There is no element "${id}" on the board.`);
  if (element.type !== "frame") return fail("not_a_frame", `"${id}" is not a frame.`);
  return element;
};

export const isFailure = (value: unknown): value is FrameFailure => typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Applies style input to a frame, validating every field. Returns the new frame, or why it cannot. */
export const applyChanges = (frame: FrameShape, changes: FrameChanges): FrameShape | FrameFailure => {
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
  if (changes.operator !== undefined) {
    if (changes.operator !== null && !["loop", "alt", "opt", "par", "break", "neg", "critical"].includes(changes.operator)) return fail("invalid", "operator must be loop, alt, opt, par, break, neg or critical.");
    set("operator", changes.operator);
  }
  if (changes.dividers !== undefined) {
    if (changes.dividers !== null && (!Array.isArray(changes.dividers) || changes.dividers.length > 8 || changes.dividers.some((d) => typeof d !== "number" || !(d > 0 && d < 1)))) return fail("invalid", "dividers are up to 8 fractions strictly between 0 and 1.");
    set("dividers", changes.dividers && changes.dividers.length > 0 ? [...changes.dividers].sort((a, b) => a - b) : undefined);
  }
  if (changes.orientation !== undefined) {
    if (changes.orientation !== null && changes.orientation !== "horizontal" && changes.orientation !== "vertical") return fail("invalid", "orientation must be horizontal or vertical.");
    set("orientation", changes.orientation);
  }
  return next as unknown as FrameShape;
};


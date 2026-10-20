import { splitStored } from "@/core/groups/group-index";
import type { DrawingElement, FrameShape, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { MAX_FRAME_DEPTH, isFrameShape } from "./frame-model";

/**
 * Read-only view of how frames own elements. It is rebuilt from the stored list and *repairs
 * virtually*, like the group index: a dangling `frameId`, a `frameId` that names a non-frame, a
 * cycle, a duplicate id or a link deeper than `MAX_FRAME_DEPTH` is ignored (the element reads as
 * top level), never thrown on and never written back. The list is shared with other clients and
 * older builds, so it can hold such data at any time.
 */
export interface FrameIndex {
  /** Frames by id. */
  readonly frames: ReadonlyMap<string, FrameShape>;
  /** Every drawable element (frames included) by id. */
  readonly shapes: ReadonlyMap<string, DrawingElement>;
  /** Element -> the frame that owns it. Absent = top level. */
  readonly parentOf: ReadonlyMap<string, string>;
  /** Frame -> direct children in stacking order. */
  readonly childrenOf: ReadonlyMap<string, readonly string[]>;
  /** Number of frames above an element; 0 = top level. */
  readonly depthOf: ReadonlyMap<string, number>;
  /** Stacking position of each element among the drawable elements. */
  readonly order: ReadonlyMap<string, number>;
}

const EMPTY: FrameIndex = {
  frames: new Map(),
  shapes: new Map(),
  parentOf: new Map(),
  childrenOf: new Map(),
  depthOf: new Map(),
  order: new Map(),
};

export const buildFrameIndex = (stored: readonly StoredElement[]): FrameIndex => {
  if (stored.length === 0) return EMPTY;
  const shapes = new Map<string, DrawingElement>();
  const frames = new Map<string, FrameShape>();
  const order = new Map<string, number>();
  for (const item of splitStored(stored).shapes) {
    if (typeof item.id !== "string" || shapes.has(item.id)) continue;
    order.set(item.id, shapes.size);
    shapes.set(item.id, item);
    if (isFrameShape(item)) frames.set(item.id, item);
  }
  if (frames.size === 0) return { ...EMPTY, shapes, order };

  const parentOf = new Map<string, string>();
  for (const [id, shape] of shapes) {
    const parent = shape.frameId;
    if (typeof parent === "string" && parent !== id && frames.has(parent)) parentOf.set(id, parent);
  }
  // Cut cycles (A in B in A): walking up from each frame, the first link that closes a loop is dropped. Each frame is walked once.
  const done = new Set<string>();
  for (const start of frames.keys()) {
    const path = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !done.has(current)) {
      if (path.has(current)) {
        parentOf.delete(current);
        break;
      }
      path.add(current);
      current = parentOf.get(current);
    }
    for (const id of path) done.add(id);
  }

  // Depth, outermost first; a link that would make an element deeper than the limit is dropped (it reads as top level).
  const depthOf = new Map<string, number>();
  const depthFor = (start: string): number => {
    const chain: string[] = [];
    let cursor: string | undefined = start;
    while (cursor !== undefined && !depthOf.has(cursor)) {
      chain.push(cursor);
      cursor = parentOf.get(cursor);
    }
    let depth = cursor === undefined ? -1 : depthOf.get(cursor)!;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      depth += 1;
      if (depth > MAX_FRAME_DEPTH) {
        parentOf.delete(chain[i]);
        depth = 0;
      }
      depthOf.set(chain[i], depth);
    }
    return depthOf.get(start)!;
  };
  for (const id of shapes.keys()) depthFor(id);

  const childrenOf = new Map<string, string[]>();
  for (const id of shapes.keys()) {
    const parent = parentOf.get(id);
    if (parent === undefined) continue;
    let list = childrenOf.get(parent);
    if (!list) childrenOf.set(parent, (list = []));
    list.push(id);
  }
  return { frames, shapes, parentOf, childrenOf, depthOf, order };
};

/** Enclosing frames of `id`, nearest first. */
export const frameAncestors = (index: Pick<FrameIndex, "parentOf">, id: string): string[] => {
  const out: string[] = [];
  for (let parent = index.parentOf.get(id); parent !== undefined; parent = index.parentOf.get(parent)) out.push(parent);
  return out;
};

/** True when `id` is inside `frameId` at any depth. */
export const isInsideFrame = (index: FrameIndex, id: string, frameId: string): boolean => {
  for (let parent = index.parentOf.get(id); parent !== undefined; parent = index.parentOf.get(parent)) if (parent === frameId) return true;
  return false;
};

/** Everything inside a frame at any depth, in stacking order (the frame itself is not included). */
export const frameDescendants = (index: FrameIndex, frameId: string): string[] => {
  const out: string[] = [];
  const stack = [...(index.childrenOf.get(frameId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    out.push(id);
    const kids = index.childrenOf.get(id);
    if (kids) stack.push(...kids);
  }
  return out.sort((a, b) => index.order.get(a)! - index.order.get(b)!);
};

/** The nearest frame that encloses both ids (or the frame itself where one is the other's frame); null = top level. */
export const commonFrame = (index: Pick<FrameIndex, "parentOf">, ids: readonly string[]): string | null => {
  let common: string[] | null = null;
  for (const id of ids) {
    const chain = frameAncestors(index, id).reverse(); // outermost first
    if (common === null) common = chain;
    else {
      let n = 0;
      while (n < common.length && n < chain.length && common[n] === chain[n]) n += 1;
      common = common.slice(0, n);
    }
  }
  return common && common.length > 0 ? common[common.length - 1] : null;
};

/**
 * Reads a stored list and reports what the index had to ignore: `frameId`s that point nowhere or at a
 * non-frame, and links cut because of a cycle or the depth limit. Used by validation and repair.
 */
export const brokenFrameLinks = (stored: readonly StoredElement[]): string[] => {
  const index = buildFrameIndex(stored);
  const broken: string[] = [];
  for (const [id, shape] of index.shapes) {
    if (shape.frameId !== undefined && index.parentOf.get(id) !== shape.frameId) broken.push(id);
  }
  return broken;
};

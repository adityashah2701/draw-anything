import { centerOf } from "@/core/geometry/box";
import type { Bounds, DrawingElement, FrameShape, Point, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildFrameIndex, frameAncestors, type FrameIndex } from "./frame-index";
import { MAX_FRAME_DEPTH, frameBox } from "./frame-model";

export const boxContains = (box: Bounds, point: Point) => point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;

/**
 * The frame an element dropped at `point` belongs to: the deepest frame whose box holds the point
 * (the topmost in stacking order among equals). `exclude` lists frames that cannot take it (the
 * dragged frame itself and everything inside it, locked frames). Null = top level.
 */
export const frameAtPoint = (index: FrameIndex, point: Point, exclude: ReadonlySet<string> = new Set()): string | null => {
  let best: string | null = null;
  let bestDepth = -1;
  let bestOrder = -1;
  for (const [id, frame] of index.frames) {
    if (exclude.has(id)) continue;
    const box = frameBox(frame);
    if (!box || !boxContains(box, point)) continue;
    const depth = index.depthOf.get(id) ?? 0;
    const order = index.order.get(id) ?? 0;
    if (depth > bestDepth || (depth === bestDepth && order > bestOrder)) {
      best = id;
      bestDepth = depth;
      bestOrder = order;
    }
  }
  return best;
};

/** The frame that should own an element occupying `bounds`: the one holding its centre. */
export const frameForBounds = (index: FrameIndex, bounds: Bounds, exclude?: ReadonlySet<string>): string | null =>
  frameAtPoint(index, centerOf(bounds), exclude);

/** Levels of frames below `id` (0 for an element that is not a frame or an empty one). */
export const subtreeHeight = (index: FrameIndex, id: string): number => {
  let height = 0;
  const stack: Array<[string, number]> = [[id, 0]];
  while (stack.length > 0) {
    const [current, level] = stack.pop()!;
    height = Math.max(height, level);
    for (const child of index.childrenOf.get(current) ?? []) if (index.frames.has(child)) stack.push([child, level + 1]);
  }
  return height;
};

/** Whether `child` (with the frames under it) may be placed in `parent` without passing `MAX_FRAME_DEPTH`. */
export const fitsDepth = (index: FrameIndex, child: string, parent: string | null): boolean => {
  const parentDepth = parent === null ? -1 : (index.depthOf.get(parent) ?? 0);
  const own = index.frames.has(child) ? subtreeHeight(index, child) : 0;
  return parentDepth + 1 + own <= MAX_FRAME_DEPTH;
};

/**
 * The stacking order a list must have so every frame is drawn before (under) everything it owns, or
 * null when it already has it. Elements keep their relative order; a frame moves down only as far as
 * its lowest descendant. Groups records are passed through untouched.
 */
export const orderFramesBelowContents = (stored: readonly StoredElement[]): string[] | null => {
  const index = buildFrameIndex(stored);
  if (index.frames.size === 0) return null;
  const ids = stored.map((item) => item.id);
  const frames = [...index.frames.keys()].sort((a, b) => (index.depthOf.get(a) ?? 0) - (index.depthOf.get(b) ?? 0));
  let moved = false;
  for (const frame of frames) {
    const at = ids.indexOf(frame);
    let lowest = Infinity;
    const stack = [...(index.childrenOf.get(frame) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      lowest = Math.min(lowest, ids.indexOf(id));
      stack.push(...(index.childrenOf.get(id) ?? []));
    }
    if (lowest < at) {
      ids.splice(at, 1);
      ids.splice(lowest, 0, frame);
      moved = true;
    }
  }
  return moved ? ids : null;
};

/** Ids of the frames above `id`, as far as the (repaired) index sees them. */
export const enclosingFrames = (stored: readonly StoredElement[], id: string): string[] => frameAncestors(buildFrameIndex(stored), id);

export const isFrameLike = (element: DrawingElement | undefined): element is FrameShape => element?.type === "frame";

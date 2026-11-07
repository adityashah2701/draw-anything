import { buildFrameIndex, frameDescendants } from "./frame-index";
import { buildGroupIndex } from "@/core/groups/group-index";
import { emptyPatch, isEmptyPatch, type DocPatch } from "@/core/groups/patch";
import { moveShape } from "@/core/shapes/shape-runtime";
import { partitionConnectors } from "@/core/groups/transform";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { withInternalConnectors } from "./internal-connectors";
import type { Bounds, StoredElement } from "@/core/model";
import { enforceMinimumSize, frameBox, resolveFrame, withBox } from "./frame-model";
import {
  fail,
  finite,
  framesAbove,
  isFailure,
  lockedBy,
  lookupFrame,
  refit,
  sameBox,
  validBox,
  Working,
  type FrameResult,
} from "./frame-common";
import { stepEach, type ManyResult } from "./frame-hierarchy";

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

/** `fitFrameToContent` for several frames at once. Inner frames are fitted first, so an outer one wraps their new size whatever order `ids` came in. */
export const fitFrames = (stored: readonly StoredElement[], ids: readonly string[]): FrameResult<ManyResult> => {
  const depth = buildFrameIndex(stored).depthOf;
  const innermostFirst = [...new Set(ids)].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
  return stepEach(stored, innermostFirst, (current, id) => fitFrameToContent(current, id));
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


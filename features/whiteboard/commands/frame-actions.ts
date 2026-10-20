import { combine, deleteFrame, fitFrameToContent, frameSelection, removeFromFrame } from "@/core/frames/frame-api";
import { buildFrameIndex } from "@/core/frames/frame-index";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";

/** What a frame command did to the board: the patch to write (one undo step) and what to select afterwards. */
export type FrameAction = { ok: true; patch: DocPatch; selection: string[] } | { ok: false; message: string };

const none = (message: string): FrameAction => ({ ok: false, message });
const isEmpty = (patch: DocPatch) => patch.add.length + patch.update.length + patch.remove.length === 0 && !patch.order;

/** What the selection allows, so menus can enable or hide their entries without planning anything. */
export interface FrameActionState {
  /** Selected frames. */
  frames: string[];
  /** Selected elements that sit in a frame. */
  owned: string[];
  /** There is something to put a frame around. */
  canFrame: boolean;
}

export const frameActionState = (stored: readonly StoredElement[], selected: readonly string[]): FrameActionState => {
  if (selected.length === 0 || !stored.some((item) => item.type === "frame")) return { frames: [], owned: [], canFrame: selected.length > 0 };
  const index = buildFrameIndex(stored);
  return {
    frames: selected.filter((id) => index.frames.has(id)),
    owned: selected.filter((id) => index.parentOf.get(id) !== undefined),
    canFrame: true,
  };
};

/** Wraps the selection in a new frame (the nearest shared frame, if any, becomes its owner). Nothing moves. */
export const planFrameSelection = (stored: readonly StoredElement[], selected: readonly string[], id: string): FrameAction => {
  if (selected.length === 0) return none("Select something to put a frame around.");
  const result = frameSelection(stored, selected, { id });
  return result.ok ? { ok: true, patch: result.patch, selection: result.selection } : none(result.message);
};

/** Takes the selection out of its frames, one level up. */
export const planRemoveFromFrame = (stored: readonly StoredElement[], selected: readonly string[]): FrameAction => {
  const { owned } = frameActionState(stored, selected);
  if (owned.length === 0) return none("Nothing selected is in a frame.");
  const result = removeFromFrame(stored, owned);
  if (!result.ok) return none(result.message);
  return isEmpty(result.patch) ? none("Those shapes are locked in their frames.") : { ok: true, patch: result.patch, selection: [...selected] };
};

/** Removes the selected frames and keeps what they held (it goes to the frame's owner, or the canvas). */
export const planReleaseFrames = (stored: readonly StoredElement[], selected: readonly string[]): FrameAction => {
  const { frames } = frameActionState(stored, selected);
  if (frames.length === 0) return none("Select a frame to remove.");
  const index = buildFrameIndex(stored);
  let working = stored;
  const patches: DocPatch[] = [];
  const freed: string[] = [];
  for (const id of frames) {
    const result = deleteFrame(working, id, { contents: "release" });
    if (!result.ok) return none(result.message);
    freed.push(...(index.childrenOf.get(id) ?? []).filter((child) => !frames.includes(child)));
    patches.push(result.patch);
    working = applyPatch(working, result.patch);
  }
  const patch = combine(stored, patches);
  return { ok: true, patch, selection: freed };
};

/** Sizes each selected frame to wrap what it holds. */
export const planFitSelectedFrames = (stored: readonly StoredElement[], selected: readonly string[]): FrameAction => {
  const { frames } = frameActionState(stored, selected);
  if (frames.length === 0) return none("Select a frame to fit.");
  const patches: DocPatch[] = [];
  let working = stored;
  let locked = false;
  const depth = buildFrameIndex(stored).depthOf;
  const innermostFirst = [...frames].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
  for (const id of innermostFirst) {
    const result = fitFrameToContent(working, id);
    if (!result.ok) {
      if (result.code === "locked") locked = true;
      else return none(result.message);
    } else if (result.changed) {
      patches.push(result.patch);
      working = applyPatch(working, result.patch);
    }
  }
  if (patches.length === 0) return none(locked ? "That frame is locked." : "The frame already fits its contents.");
  return { ok: true, patch: combine(stored, patches), selection: [...selected] };
};

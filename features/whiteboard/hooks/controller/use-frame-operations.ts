import { useCallback } from "react";
import { toast } from "sonner";
import { buildFrameIndex } from "@/core/frames/frame-index";
import { buildGroupIndex, isEffectivelyLocked } from "@/core/groups/group-index";
import { makeBounds } from "@/core/geometry/box";
import { frameForBounds } from "@/core/frames/containment";
import { createFrame, fitFrames, planAutoFit, reparentMoved, updateFrames, type FrameChanges } from "@/core/frames/frame-api";
import { applyPatch as applyStoredPatch, type DocPatch } from "@/core/groups/patch";
import type { DrawingElement, StoredElement, Tool } from "@/features/whiteboard/types/whiteboard.types";

export interface UseFrameOperationsProps {
  readLiveStored: () => StoredElement[];
  applyDocPatch: (patch: DocPatch) => void;
  setSelectedElements: (elements: string[] | ((prev: string[]) => string[])) => void;
  setCurrentTool: (tool: Tool) => void;
  hasEditAccess: boolean;
}

export function useFrameOperations({
  readLiveStored,
  applyDocPatch,
  setSelectedElements,
  setCurrentTool,
  hasEditAccess,
}: UseFrameOperationsProps) {
  /**
   * After a drag: shapes dropped into (or out of) a frame change owner, and auto-fit frames follow what
   * they now hold. Runs inside the drag's undo step, so it is never a step of its own.
   */
  const commitFrameOwnership = useCallback(
    (movedIds: string[]) => {
      const stored = readLiveStored();
      if (!stored.some((item) => item.type === "frame")) return;
      const before = buildFrameIndex(stored);
      const leftFrames = movedIds.flatMap((id) => before.parentOf.get(id) ?? []);
      let working = stored;
      const reparent = reparentMoved(stored, movedIds);
      if (reparent?.ok) {
        applyDocPatch(reparent.patch);
        working = applyStoredPatch(stored, reparent.patch);
      }
      const fit = planAutoFit(working, movedIds, leftFrames);
      if (fit) applyDocPatch(fit);
    },
    [applyDocPatch, readLiveStored],
  );

  /**
   * The frame tool: the drawn box becomes a frame that takes over what its box covers and sits inside
   * the frame it was drawn in. One patch, so one undo step.
   */
  const commitDrawnFrame = useCallback(
    (draft: DrawingElement) => {
      const [a, b] = draft.points;
      if (!a || !b) return;
      const box = makeBounds(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      const stored = readLiveStored();
      const frameIndex = buildFrameIndex(stored);
      // A locked frame cannot take a new one in: draw beside it, at the level above.
      const lockIndex = buildGroupIndex(stored);
      const lockedFrames = new Set([...frameIndex.frames.keys()].filter((id) => isEffectivelyLocked(lockIndex, id)));
      const parent = frameForBounds(frameIndex, box, lockedFrames);
      const created = createFrame(stored, { id: draft.id, box, parent, adopt: true });
      if (!created.ok) {
        toast(created.message);
        return;
      }
      applyDocPatch(created.patch);
      setSelectedElements([created.frameId]);
      setCurrentTool("select");
    },
    [applyDocPatch, readLiveStored, setSelectedElements, setCurrentTool],
  );

  /** Properties-bar edits that only frames have (title, header, padding, auto-fit), as one undo step. */
  const updateFrameProps = useCallback(
    (ids: readonly string[], changes: FrameChanges) => {
      if (!hasEditAccess) return;
      const result = updateFrames(readLiveStored(), ids, changes);
      if (result.ok && result.changed.length > 0) applyDocPatch(result.patch);
    },
    [applyDocPatch, readLiveStored, hasEditAccess],
  );

  /** Sizes the frames to wrap what they hold. */
  const fitFramesToContent = useCallback(
    (ids: readonly string[]) => {
      if (!hasEditAccess) return;
      const result = fitFrames(readLiveStored(), ids);
      if (result.ok && result.changed.length > 0) applyDocPatch(result.patch);
    },
    [applyDocPatch, readLiveStored, hasEditAccess],
  );

  return {
    commitFrameOwnership,
    commitDrawnFrame,
    updateFrameProps,
    fitFramesToContent,
  };
}


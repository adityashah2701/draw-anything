import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { DocPatch } from "@/core/groups/patch";
import {
  frameActionState,
  planFitSelectedFrames,
  planFrameSelection,
  planReleaseFrames,
  planRemoveFromFrame,
  type FrameAction,
} from "@/features/whiteboard/commands/frame-actions";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";

interface Props {
  /** The board as the editor shows it (drives which entries are enabled). */
  stored: readonly StoredElement[];
  /** The board as the document holds it right now; a command plans against this, never a stale render. */
  readLive: () => readonly StoredElement[];
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  hasEditAccess: boolean;
  generateId: () => string;
  /** One storage mutation = one undo step. */
  applyPatch: (patch: DocPatch) => void;
}

/**
 * Frame commands for menus, the palette and shortcuts: frame the selection, take it out of its frame, remove
 * a frame but keep what is in it, fit a frame to its contents. Thin wiring over `frame-actions`, which plans
 * each as one patch; a command that cannot run says why in a toast instead of failing silently.
 */
export const useFrameCommands = ({ stored, readLive, selectedElements, setSelectedElements, hasEditAccess, generateId, applyPatch }: Props) => {
  const state = useMemo(() => frameActionState(stored, selectedElements), [stored, selectedElements]);

  const run = useCallback(
    (plan: (live: readonly StoredElement[]) => FrameAction): boolean => {
      if (!hasEditAccess) return false;
      const result = plan(readLive());
      if (!result.ok) {
        toast(result.message);
        return false;
      }
      applyPatch(result.patch);
      setSelectedElements(result.selection);
      return true;
    },
    [applyPatch, hasEditAccess, readLive, setSelectedElements],
  );

  const frameSelection = useCallback(() => run((live) => planFrameSelection(live, selectedElements, generateId())), [generateId, run, selectedElements]);
  const removeFromFrame = useCallback(() => run((live) => planRemoveFromFrame(live, selectedElements)), [run, selectedElements]);
  const releaseFrames = useCallback(() => run((live) => planReleaseFrames(live, selectedElements)), [run, selectedElements]);
  const fitFrames = useCallback(() => run((live) => planFitSelectedFrames(live, selectedElements)), [run, selectedElements]);

  return {
    canFrame: hasEditAccess && state.canFrame,
    canRemoveFromFrame: hasEditAccess && state.owned.length > 0,
    hasSelectedFrame: state.frames.length > 0,
    frameSelection,
    removeFromFrame,
    releaseFrames,
    fitFrames,
  };
};

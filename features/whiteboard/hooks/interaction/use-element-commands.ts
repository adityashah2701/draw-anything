import { useCallback, useMemo } from "react";
import { isEffectivelyLocked } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import { planAlign, planDistribute, planMoveBy, planSpacing, planZOrder } from "@/features/whiteboard/commands/arrange";
import { copySourceOf, planDuplicate, planInsertCopies } from "@/features/whiteboard/commands/duplicate";
import type { AlignMode, DistributeAxis, ZMove } from "@/features/whiteboard/utils/arrange";
import { copyToClipboard, hasClipboard, takeFromClipboard } from "@/features/whiteboard/utils/clipboard";

interface Props {
  /** The board as the commands see it: the same object the AI tools build over their own copy. */
  ctx: CommandContext;
  /** Selected shape ids (a selected group is all of its shapes). */
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  hasEditAccess: boolean;
  /** Each call is ONE storage mutation, hence one undo step. */
  applyPatch: (patch: DocPatch) => void;
  deleteElements: (ids: string[]) => void;
}

/**
 * Copy, paste, duplicate, nudge, align, distribute, spacing and z-order for the current selection. The
 * decisions are the planners in `features/whiteboard/commands`, which the AI tools call too; this hook
 * only feeds them the selection and writes what they return.
 */
export const useElementCommands = ({ ctx, selectedElements, setSelectedElements, hasEditAccess, applyPatch, deleteElements }: Props) => {
  const selectedSet = useMemo(() => new Set(selectedElements), [selectedElements]);

  const write = useCallback(
    (patch: DocPatch | null) => {
      if (patch) applyPatch(patch);
    },
    [applyPatch],
  );

  const copy = useCallback(() => {
    if (selectedElements.length === 0) return;
    const { shapes, groups } = copySourceOf(ctx, selectedSet);
    copyToClipboard(shapes, groups);
  }, [ctx, selectedElements.length, selectedSet]);

  const paste = useCallback(() => {
    if (!hasEditAccess) return;
    const taken = takeFromClipboard();
    if (!taken) return;
    const plan = planInsertCopies(ctx, taken.elements, taken.groups, taken.step);
    applyPatch(plan.patch);
    setSelectedElements(plan.selection);
  }, [applyPatch, ctx, hasEditAccess, setSelectedElements]);

  const duplicate = useCallback(() => {
    if (!hasEditAccess || selectedElements.length === 0) return;
    const plan = planDuplicate(ctx, selectedSet);
    if (!plan) return;
    applyPatch(plan.patch);
    setSelectedElements(plan.selection);
  }, [applyPatch, ctx, hasEditAccess, selectedElements.length, selectedSet, setSelectedElements]);

  const cut = useCallback(() => {
    if (!hasEditAccess || selectedElements.length === 0) return;
    copy();
    deleteElements(selectedElements);
    // Locked shapes survive a cut; whatever is left stays selected.
    setSelectedElements(selectedElements.filter((id) => isEffectivelyLocked(ctx.index, id)));
  }, [copy, ctx.index, deleteElements, hasEditAccess, selectedElements, setSelectedElements]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (hasEditAccess) write(planMoveBy(ctx, selectedElements, dx, dy));
    },
    [ctx, hasEditAccess, selectedElements, write],
  );

  const align = useCallback((mode: AlignMode) => hasEditAccess && write(planAlign(ctx, selectedElements, mode)), [ctx, hasEditAccess, selectedElements, write]);

  const distribute = useCallback(
    (axis: DistributeAxis) => hasEditAccess && write(planDistribute(ctx, selectedElements, axis)),
    [ctx, hasEditAccess, selectedElements, write],
  );

  /** Exactly `gap` between neighbouring units along an axis. */
  const spacing = useCallback(
    (axis: DistributeAxis, gap: number) => hasEditAccess && write(planSpacing(ctx, selectedElements, axis, gap)),
    [ctx, hasEditAccess, selectedElements, write],
  );

  const zOrder = useCallback((move: ZMove) => hasEditAccess && write(planZOrder(ctx, selectedElements, move)), [ctx, hasEditAccess, selectedElements, write]);

  return { copy, cut, paste, duplicate, nudge, align, distribute, spacing, zOrder, canPaste: hasClipboard };
};

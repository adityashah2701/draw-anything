import { useCallback, useMemo } from "react";
import { hasHidden } from "@/core/groups/visibility";
import type { DocPatch } from "@/core/groups/patch";
import { planConnectorLabel } from "@/features/whiteboard/commands/connectors";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import { planFrame } from "@/features/whiteboard/commands/frame";
import { planAutoLayout, planTidy, type LayoutOptions } from "@/features/whiteboard/commands/layout";
import { planHide, planShow, planShowAll } from "@/features/whiteboard/commands/visibility";

interface Props {
  ctx: CommandContext;
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  hasEditAccess: boolean;
  /** One storage mutation = one undo step. */
  applyPatch: (patch: DocPatch) => void;
}

/** What a command did, so the UI can say something when it found nothing to do. */
export interface OrganizeOutcome {
  changed: boolean;
  notes: string[];
}

const NOTHING: OrganizeOutcome = { changed: false, notes: [] };

/**
 * Hide and show, frame a selection, lay out or tidy shapes, label a connector: thin wiring over the planners
 * in `features/whiteboard/commands`, the same ones the AI tools run.
 */
export const useOrganizeCommands = ({ ctx, selectedElements, setSelectedElements, hasEditAccess, applyPatch }: Props) => {
  const hiddenCount = useMemo(() => ctx.stored.filter((item) => item.hidden === true).length, [ctx.stored]);

  const write = useCallback(
    (patch: DocPatch | null, notes: string[] = []): OrganizeOutcome => {
      if (!patch) return { changed: false, notes };
      applyPatch(patch);
      return { changed: true, notes };
    },
    [applyPatch],
  );

  const hide = useCallback((): OrganizeOutcome => {
    if (!hasEditAccess) return NOTHING;
    const outcome = write(planHide(ctx, selectedElements));
    // What was hidden can no longer be selected: leave nothing selected rather than a ghost selection.
    if (outcome.changed) setSelectedElements([]);
    return outcome;
  }, [ctx, hasEditAccess, selectedElements, setSelectedElements, write]);

  const show = useCallback((): OrganizeOutcome => (hasEditAccess ? write(planShow(ctx, selectedElements)) : NOTHING), [ctx, hasEditAccess, selectedElements, write]);

  const showAll = useCallback((): OrganizeOutcome => (hasEditAccess ? write(planShowAll(ctx)) : NOTHING), [ctx, hasEditAccess, write]);

  const frame = useCallback(
    (title = "Section"): OrganizeOutcome => {
      if (!hasEditAccess || selectedElements.length === 0) return NOTHING;
      const plan = planFrame(ctx, selectedElements, { title });
      return plan ? write(plan.patch) : NOTHING;
    },
    [ctx, hasEditAccess, selectedElements, write],
  );

  /** `ids` omitted: the selection, or every node when nothing is selected. */
  const autoLayout = useCallback(
    (options: LayoutOptions): OrganizeOutcome => {
      if (!hasEditAccess) return NOTHING;
      const plan = planAutoLayout(ctx, selectedElements.length > 1 ? selectedElements : null, options);
      return write(plan.patch, plan.notes);
    },
    [ctx, hasEditAccess, selectedElements, write],
  );

  const tidy = useCallback((): OrganizeOutcome => {
    if (!hasEditAccess) return NOTHING;
    const plan = planTidy(ctx, selectedElements.length > 1 ? selectedElements : null);
    return write(plan.patch, plan.notes);
  }, [ctx, hasEditAccess, selectedElements, write]);

  const setConnectorLabel = useCallback(
    (arrowId: string, text: string): OrganizeOutcome => {
      if (!hasEditAccess) return NOTHING;
      const plan = planConnectorLabel(ctx, arrowId, text);
      return plan ? write(plan.patch.add.length + plan.patch.update.length + plan.patch.remove.length > 0 ? plan.patch : null) : NOTHING;
    },
    [ctx, hasEditAccess, write],
  );

  return { hiddenCount, anyHidden: hasHidden(ctx.stored), hide, show, showAll, frame, autoLayout, tidy, setConnectorLabel };
};

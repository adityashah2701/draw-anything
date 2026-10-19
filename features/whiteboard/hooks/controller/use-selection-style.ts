import { useCallback } from "react";
import type { DocPatch } from "@/core/groups/patch";
import type { CommandContext } from "@/features/whiteboard/commands/context";
import { planStyle, type StyleChange } from "@/features/whiteboard/commands/style";
import type { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";

interface UseSelectionStyleOptions {
  uiState: ReturnType<typeof useWhiteboardUiState>;
  ctx: CommandContext;
  selectedElements: string[];
  hasEditAccess: boolean;
  /** One storage mutation for the whole batch, so a style change on many shapes is one undo step. */
  applyPatch: (patch: DocPatch) => void;
}

/**
 * Style changes from the properties panel: remember the choice for new shapes and apply it to the selection.
 * Locked shapes (and shapes in locked groups) are never restyled; the decision is `planStyle`, the same
 * command the AI's style tools run.
 */
export const useSelectionStyle = ({ uiState, ctx, selectedElements, hasEditAccess, applyPatch }: UseSelectionStyleOptions) => {
  const applyStyle = useCallback(
    (change: StyleChange, ids: readonly string[] = selectedElements) => {
      if (ids.length === 0 || !hasEditAccess) return;
      const { patch } = planStyle(ctx, ids, change, { strict: false });
      if (patch) applyPatch(patch);
    },
    [applyPatch, ctx, hasEditAccess, selectedElements],
  );

  const handleStrokeWidthChange = useCallback(
    (width: number) => {
      uiState.setStrokeWidth(width);
      applyStyle({ strokeWidth: width });
    },
    [uiState, applyStyle],
  );

  const handleFontSizeChange = useCallback(
    (size: number) => {
      uiState.setFontSize(size);
      applyStyle({ fontSize: size });
    },
    [uiState, applyStyle],
  );

  /**
   * The properties bar's edit: remember colour, fill, stroke and text size for new shapes, and apply the change
   * to `ids` only (the shapes the property means something for), as one undo step.
   */
  const handleStyleChange = useCallback(
    (change: StyleChange, ids: readonly string[]) => {
      if (change.color !== undefined) uiState.setCurrentColor(change.color);
      if (change.fill !== undefined) uiState.setFillColor(change.fill ?? "#transparent");
      if (change.strokeWidth !== undefined) uiState.setStrokeWidth(change.strokeWidth);
      if (change.fontSize !== undefined) uiState.setFontSize(change.fontSize);
      applyStyle(change, ids);
    },
    [uiState, applyStyle],
  );

  return { handleStyleChange, handleStrokeWidthChange, handleFontSizeChange, applyStyle };
};

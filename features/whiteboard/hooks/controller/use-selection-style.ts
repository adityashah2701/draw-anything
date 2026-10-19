import { useCallback } from "react";
import type { DrawingElementJson } from "@/liveblocks.config";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";

interface UseSelectionStyleOptions {
  uiState: ReturnType<typeof useWhiteboardUiState>;
  elements: DrawingElement[];
  selectedElements: string[];
  hasEditAccess: boolean;
  /** Locked shapes (and shapes in locked groups) are never restyled. */
  isLocked: (shapeId: string) => boolean;
  /** One storage mutation for the whole batch, so a style change on many shapes is one undo step. */
  updateElements: (batch: DrawingElementJson[]) => void;
}

/** Style changes from the properties panel: remember the choice for new shapes and apply it to the selection. */
export const useSelectionStyle = ({
  uiState,
  elements,
  selectedElements,
  hasEditAccess,
  isLocked,
  updateElements,
}: UseSelectionStyleOptions) => {
  const applyToSelection = useCallback(
    (patch: Partial<DrawingElement>) => {
      if (selectedElements.length === 0 || !hasEditAccess) return;
      const targets = new Set(selectedElements);
      const batch = elements
        .filter((element) => targets.has(element.id) && !isLocked(element.id))
        .map((element) => ({ ...element, ...patch }) as unknown as DrawingElementJson);
      if (batch.length > 0) updateElements(batch);
    },
    [elements, selectedElements, hasEditAccess, isLocked, updateElements],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      uiState.setCurrentColor(color);
      uiState.setShowOutlineColorPicker(false);
      applyToSelection({ color });
    },
    [uiState, applyToSelection],
  );

  const handleFillColorChange = useCallback(
    (color: string) => {
      uiState.setFillColor(color);
      uiState.setShowFillColorPicker(false);
      applyToSelection({ fill: color } as Partial<DrawingElement>);
    },
    [uiState, applyToSelection],
  );

  const handleStrokeWidthChange = useCallback(
    (width: number) => {
      uiState.setStrokeWidth(width);
      applyToSelection({ strokeWidth: width });
    },
    [uiState, applyToSelection],
  );

  const handleFontSizeChange = useCallback(
    (size: number) => {
      uiState.setFontSize(size);
      applyToSelection({ fontSize: size } as Partial<DrawingElement>);
    },
    [uiState, applyToSelection],
  );

  return { handleColorChange, handleFillColorChange, handleStrokeWidthChange, handleFontSizeChange, applyToSelection };
};

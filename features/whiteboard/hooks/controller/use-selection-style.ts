import { useCallback } from "react";
import type { DrawingElementJson } from "@/liveblocks.config";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";

interface UseSelectionStyleOptions {
  uiState: ReturnType<typeof useWhiteboardUiState>;
  elements: DrawingElement[];
  selectedElements: string[];
  hasEditAccess: boolean;
  updateElement: (element: DrawingElementJson) => void;
}

/** Style changes from the properties panel: remember the choice for new shapes and apply it to the selection. */
export const useSelectionStyle = ({
  uiState,
  elements,
  selectedElements,
  hasEditAccess,
  updateElement,
}: UseSelectionStyleOptions) => {
  const applyToSelection = useCallback(
    (patch: Partial<DrawingElement>) => {
      if (selectedElements.length === 0 || !hasEditAccess) return;
      for (const id of selectedElements) {
        const element = elements.find((candidate) => candidate.id === id);
        if (element) updateElement({ ...element, ...patch } as unknown as DrawingElementJson);
      }
    },
    [elements, selectedElements, hasEditAccess, updateElement],
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

  return { handleColorChange, handleFillColorChange, handleStrokeWidthChange, handleFontSizeChange };
};

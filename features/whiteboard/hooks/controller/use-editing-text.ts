import { useCallback } from "react";
import type { DrawingElementJson } from "@/liveblocks.config";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { useWhiteboardUiState } from "@/features/whiteboard/hooks/state/use-whiteboard-ui-state";
import { resolveTextCommit, withTextFormat, type TextFormat } from "./editing-text";

interface UseEditingTextOptions {
  uiState: ReturnType<typeof useWhiteboardUiState>;
  elements: DrawingElement[];
  addElement: (element: DrawingElementJson) => void;
  updateElement: (element: DrawingElementJson) => void;
  deleteElementsLive: (ids: string[]) => void;
}

/** Live typing, commit and move of the text block being edited on the canvas. */
export const useEditingText = ({ uiState, elements, addElement, updateElement, deleteElementsLive }: UseEditingTextOptions) => {
  const handleEditingTextChange = useCallback(
    (text: string, format: TextFormat) => {
      uiState.setEditingTextElement((prev) => (prev ? withTextFormat(prev, text, format) : prev));
    },
    [uiState],
  );

  const handleEditingTextCommit = useCallback(
    (text: string, format: TextFormat) => {
      const editing = uiState.editingTextElement;
      if (!editing) return;

      const commit = resolveTextCommit({
        editing,
        isNew: uiState.isNewTextElement,
        text,
        format,
        stored: elements.find((e) => e.id === editing.id),
      });
      if (commit.kind === "add") addElement(commit.element as unknown as DrawingElementJson);
      else if (commit.kind === "update") updateElement(commit.element as unknown as DrawingElementJson);
      else if (commit.kind === "delete") deleteElementsLive([commit.id]);

      uiState.setEditingTextElement(null);
      uiState.setIsNewTextElement(false);
    },
    [addElement, deleteElementsLive, elements, uiState, updateElement],
  );

  const handleEditingTextMove = useCallback(
    (newPoint: { x: number; y: number }) => {
      const editing = uiState.editingTextElement;
      if (!editing) return;
      const updated: DrawingElement = { ...editing, points: [newPoint, ...editing.points.slice(1)] };
      if (!uiState.isNewTextElement) updateElement(updated as unknown as DrawingElementJson);
      uiState.setEditingTextElement(updated);
    },
    [uiState, updateElement],
  );

  return { handleEditingTextChange, handleEditingTextCommit, handleEditingTextMove };
};

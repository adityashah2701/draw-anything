import { useCallback } from "react";
import { useWhiteboardKeyboard } from "@/features/whiteboard/hooks/interaction/use-whiteboard-keyboard";
import type { ShortcutCommand } from "@/features/whiteboard/hooks/interaction/keyboard-policy";
import type { DrawingElement, Tool } from "@/features/whiteboard/types/whiteboard.types";
import type { useElementCommands } from "@/features/whiteboard/hooks/interaction/use-element-commands";
import type { useGroupCommands } from "@/features/whiteboard/hooks/interaction/use-group-commands";
import type { useOrganizeCommands } from "@/features/whiteboard/hooks/interaction/use-organize-commands";
import type { useFrameCommands } from "@/features/whiteboard/hooks/interaction/use-frame-commands";

export interface UseKeyboardShortcutsProps {
  currentTool: Tool;
  setCurrentTool: (tool: Tool) => void;
  hasEditAccess: boolean;
  selectedElements: string[];
  setSelectedElements: (elements: string[] | ((prev: string[]) => string[])) => void;
  elements: DrawingElement[];
  handleUndo: () => void;
  handleRedo: () => void;
  saveWhiteboard: () => void;
  elementCommands: ReturnType<typeof useElementCommands>;
  groupCommands: ReturnType<typeof useGroupCommands>;
  organizeCommands: ReturnType<typeof useOrganizeCommands>;
  frameCommands: ReturnType<typeof useFrameCommands>;
  deleteSelectedElements: () => void;
  cancelDrawing: () => boolean;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  toggleGrid: () => void;
  handleFitToScreen: () => void;
  setShowCommandMenu: (updater: (prev: boolean) => boolean) => void;
  setShowExport: (show: boolean) => void;
  setShowIconPicker: (show: boolean) => void;
  beginEditing: (element: DrawingElement) => boolean;
}

export function useKeyboardShortcuts({
  currentTool,
  setCurrentTool,
  hasEditAccess,
  selectedElements,
  setSelectedElements,
  elements,
  handleUndo,
  handleRedo,
  saveWhiteboard,
  elementCommands,
  groupCommands,
  organizeCommands,
  frameCommands,
  deleteSelectedElements,
  cancelDrawing,
  handleZoomIn,
  handleZoomOut,
  handleResetZoom,
  toggleGrid,
  handleFitToScreen,
  setShowCommandMenu,
  setShowExport,
  setShowIconPicker,
  beginEditing,
}: UseKeyboardShortcutsProps) {
  const runShortcut = useCallback(
    (command: ShortcutCommand) => {
      switch (command.type) {
        case "undo": return handleUndo();
        case "redo": return handleRedo();
        case "save": return saveWhiteboard();
        case "select-all": return setSelectedElements(elements.map((el) => el.id));
        case "copy": return elementCommands.copy();
        case "cut": return elementCommands.cut();
        case "paste": return elementCommands.paste();
        case "duplicate": return elementCommands.duplicate();
        case "group": return groupCommands.group();
        case "ungroup": return groupCommands.ungroup();
        case "lock-toggle": return groupCommands.toggleLock();
        case "hide": return void organizeCommands.hide();
        case "frame-selection": return void frameCommands.frameSelection();
        case "align": return elementCommands.align(command.mode);
        case "distribute": return elementCommands.distribute(command.axis);
        case "nudge": return elementCommands.nudge(command.dx, command.dy);
        case "z-order": return elementCommands.zOrder(command.move);
        case "delete":
          return deleteSelectedElements();
        // Escape: abandon a half-made shape or connector first; then step out of an entered group; then
        // clear the selection; then leave a drawing tool.
        case "escape":
          if (cancelDrawing()) return;
          if (groupCommands.exit()) return;
          if (selectedElements.length > 0) return setSelectedElements([]);
          return setCurrentTool("select");
        case "zoom-in": return handleZoomIn();
        case "zoom-out": return handleZoomOut();
        case "zoom-reset": return handleResetZoom();
        case "fit": return handleFitToScreen();
        case "toggle-grid": return toggleGrid();
        case "toggle-help": return setShowCommandMenu((prev) => !prev);
        case "export": return setShowExport(true);
        case "icon-picker": return setShowIconPicker(true);
        // Enter on a selected group steps into it; on a selected shape it edits its text, like double-clicking it.
        case "edit": {
          if (groupCommands.enter()) return;
          const only = selectedElements.length === 1 ? elements.find((el) => el.id === selectedElements[0]) : undefined;
          if (only) beginEditing(only);
          return;
        }
      }
    },
    [
      beginEditing,
      cancelDrawing,
      deleteSelectedElements,
      elementCommands,
      elements,
      frameCommands,
      groupCommands,
      handleFitToScreen,
      handleRedo,
      handleResetZoom,
      handleUndo,
      handleZoomIn,
      handleZoomOut,
      organizeCommands,
      saveWhiteboard,
      selectedElements,
      setCurrentTool,
      setSelectedElements,
      setShowCommandMenu,
      setShowExport,
      setShowIconPicker,
      toggleGrid,
    ],
  );

  useWhiteboardKeyboard({
    currentTool,
    setCurrentTool,
    hasEditAccess,
    hasSelection: selectedElements.length > 0,
    onCommand: runShortcut,
  });

  return { runShortcut };
}


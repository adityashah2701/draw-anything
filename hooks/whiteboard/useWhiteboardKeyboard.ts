import { useEffect, useCallback } from "react";
import { Tool } from "@/types/whiteboard.types";

interface UseWhiteboardKeyboardProps {
  currentTool: Tool;
  setCurrentTool: (tool: Tool) => void;
  hasEditAccess: boolean;
  
  // Actions
  handleUndo: () => void;
  handleRedo: () => void;
  saveWhiteboard: () => void;
  selectAllElements: () => void;
  deleteSelectedElements: () => void;
  clearSelection: () => void;
  
  // Viewport
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  toggleGrid: () => void;
  
  // UI State
  setShowShortcuts: (show: boolean | ((prev: boolean) => boolean)) => void;
}

export const useWhiteboardKeyboard = ({
  currentTool,
  setCurrentTool,
  hasEditAccess,
  handleUndo,
  handleRedo,
  saveWhiteboard,
  selectAllElements,
  deleteSelectedElements,
  clearSelection,
  handleZoomIn,
  handleZoomOut,
  handleResetZoom,
  toggleGrid,
  setShowShortcuts,
}: UseWhiteboardKeyboardProps) => {
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Show/hide shortcuts
    if (e.key === "?" || (e.ctrlKey && e.key === "/")) {
      e.preventDefault();
      setShowShortcuts((prev) => !prev);
      return;
    }

    // Ctrl/Cmd + Key combinations
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          break;
        case "y":
          e.preventDefault();
          handleRedo();
          break;
        case "s":
          e.preventDefault();
          saveWhiteboard();
          break;
        case "a":
          e.preventDefault();
          selectAllElements();
          break;
        case "=":
        case "+":
          e.preventDefault();
          handleZoomIn();
          break;
        case "-":
          e.preventDefault();
          handleZoomOut();
          break;
        case "0":
          e.preventDefault();
          handleResetZoom();
          break;
      }
      return;
    }

    // Skip if typing in input fields
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    // Tool shortcuts and other single key commands
    switch (e.key.toLowerCase()) {
      // Tool selection
      case "v":
        setCurrentTool("select");
        break;
      case "p":
        if (hasEditAccess) setCurrentTool("pen");
        break;
      case "r":
        if (hasEditAccess) setCurrentTool("rectangle");
        break;
      case "c":
        if (hasEditAccess) setCurrentTool("circle");
        break;
      case "l":
        if (hasEditAccess) setCurrentTool("line");
        break;
      case "a":
        if (hasEditAccess) setCurrentTool("arrow");
        break;
      case "t":
        if (hasEditAccess) setCurrentTool("text");
        break;
      case "e":
        if (hasEditAccess) setCurrentTool("eraser");
        break;
      case "h":
        setCurrentTool("hand");
        break;
      
      // Canvas operations
      case "g":
        e.preventDefault();
        toggleGrid();
        break;
      case "delete":
      case "backspace":
        e.preventDefault();
        deleteSelectedElements();
        break;
      case "escape":
        e.preventDefault();
        clearSelection();
        break;
      case " ":
        e.preventDefault();
        if (currentTool !== "hand") {
          setCurrentTool("hand");
        }
        break;
    }
  }, [
    currentTool,
    setCurrentTool,
    hasEditAccess,
    handleUndo,
    handleRedo,
    saveWhiteboard,
    selectAllElements,
    deleteSelectedElements,
    clearSelection,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    toggleGrid,
    setShowShortcuts,
  ]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    // Return to select tool when spacebar is released
    if (e.key === " " && currentTool === "hand") {
      setCurrentTool("select");
    }
  }, [currentTool, setCurrentTool]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    // This hook primarily handles side effects (keyboard events)
    // and doesn't need to return any state
  };
};
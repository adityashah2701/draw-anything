import { useCallback, useEffect, useRef } from "react";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";
import {
  isTextEntryTarget,
  resolveShortcut,
  type ShortcutCommand,
} from "@/features/whiteboard/hooks/interaction/keyboard-policy";

interface UseWhiteboardKeyboardProps {
  currentTool: Tool;
  setCurrentTool: (tool: Tool) => void;
  hasEditAccess: boolean;
  hasSelection: boolean;
  /** Runs every command except the tool switches and the Space-to-pan hold, which live here. */
  onCommand: (command: ShortcutCommand) => void;
}

/** Window key listener; what each key means is decided by `keyboard-policy.ts`. */
export const useWhiteboardKeyboard = ({
  currentTool,
  setCurrentTool,
  hasEditAccess,
  hasSelection,
  onCommand,
}: UseWhiteboardKeyboardProps) => {
  // The tool to return to when Space is released (only set while Space is what switched to hand).
  const toolBeforeSpaceRef = useRef<Tool | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // A menu (the toolbar flyouts) owns the keyboard while it has focus: arrows, typeahead, Enter.
      if (e.target instanceof Element && e.target.closest("[role=menu]")) return;
      const command = resolveShortcut(e, {
        textEntry: isTextEntryTarget(e.target),
        hasEditAccess,
        hasSelection,
      });
      if (!command) return;
      // Enter on a focused button, link, menu item or dialog activates that control, not "edit the selection".
      if (
        command.type === "edit" &&
        e.target instanceof Element &&
        e.target.closest("button, a, [role=menuitem], [role=option], [role=dialog]")
      ) {
        return;
      }
      // Browser defaults (page scroll on arrows/space, save dialog, bookmark...) are never wanted here.
      e.preventDefault();
      if (command.type === "tool") return setCurrentTool(command.tool);
      if (command.type === "hand-hold") {
        if (currentTool !== "hand") {
          toolBeforeSpaceRef.current = currentTool;
          setCurrentTool("hand");
        }
        return;
      }
      onCommand(command);
    },
    [currentTool, hasEditAccess, hasSelection, onCommand, setCurrentTool],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== " " || toolBeforeSpaceRef.current === null) return;
      const previous = toolBeforeSpaceRef.current;
      toolBeforeSpaceRef.current = null;
      setCurrentTool(previous);
    },
    [setCurrentTool],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
};

import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Right-click menu for the canvas; every entry runs the same command as its keyboard shortcut. */
export const CanvasContextMenu = ({ controller, children }: { controller: WhiteboardPageController; children: ReactNode }) => {
  const { elementCommands: c, groupCommands: g, selectedElements, whiteboardAccess, elements } = controller;
  const edit = whiteboardAccess.hasEditAccess;
  // Align and distribute work on units: a group counts as one, however many shapes it holds.
  const count = g.units.length;
  const some = selectedElements.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={!some} onSelect={c.copy}>
          Copy <ContextMenuShortcut>{mod}C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!edit || !some} onSelect={c.cut}>
          Cut <ContextMenuShortcut>{mod}X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!edit || !c.canPaste()} onSelect={c.paste}>
          Paste <ContextMenuShortcut>{mod}V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!edit || !some} onSelect={c.duplicate}>
          Duplicate <ContextMenuShortcut>{mod}D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!edit || !g.canGroup} onSelect={g.group}>
          Group <ContextMenuShortcut>{mod}G</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!edit || !g.canUngroup} onSelect={g.ungroup}>
          Ungroup <ContextMenuShortcut>{mod}⇧G</ContextMenuShortcut>
        </ContextMenuItem>
        {g.selectedGroupId && (
          <ContextMenuItem onSelect={() => g.enter()}>
            Edit group <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ContextMenuItem disabled={!edit || !some} onSelect={g.toggleLock}>
          {g.allLocked ? "Unlock" : "Lock"} <ContextMenuShortcut>{mod}⇧L</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!edit || !some}>Order</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => c.zOrder("front")}>Bring to front</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.zOrder("forward")}>Bring forward</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.zOrder("backward")}>Send backward</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.zOrder("back")}>Send to back</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!edit || count < 2}>Align</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => c.align("left")}>Left</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.align("center")}>Centre</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.align("right")}>Right</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => c.align("top")}>Top</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.align("middle")}>Middle</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.align("bottom")}>Bottom</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!edit || count < 3}>Distribute</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => c.distribute("horizontal")}>Horizontally</ContextMenuItem>
            <ContextMenuItem onSelect={() => c.distribute("vertical")}>Vertically</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={!edit || !some} onSelect={() => controller.deleteSelectedElements()}>
          Delete <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={elements.length === 0} onSelect={controller.handleSelectAllElements}>
          Select all <ContextMenuShortcut>{mod}A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={elements.length === 0} onSelect={controller.handleFitToScreen}>
          Fit to content <ContextMenuShortcut>F</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default CanvasContextMenu;

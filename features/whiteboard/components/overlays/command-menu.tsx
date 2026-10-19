"use client";

import * as React from "react";
import {
  ArrowRight,
  ArrowLeftRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Minus,
  MousePointer,
  Pencil,
  Square,
  Type,
  Copy,
  Download,
  Save,
  Trash2,
  Keyboard,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Shapes,
  Bot,
  Code2,
  Group,
  Ungroup,
  Lock,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";

interface CommandMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onToolChange: (tool: Tool) => void;
  onAction?: (action: string) => void;
}

export function CommandMenu({
  isOpen,
  onOpenChange,
  onToolChange,
  onAction,
}: CommandMenuProps) {
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!isOpen);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isOpen, onOpenChange]);

  const runCommand = (command: () => void) => {
    command();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList className="max-h-[80vh]">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Tools">
          <CommandItem
            onSelect={() => runCommand(() => onToolChange("select"))}
          >
            <MousePointer className="mr-2 h-4 w-4" />
            <span>Select</span>
            <CommandShortcut>V</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onToolChange("pen"))}>
            <Pencil className="mr-2 h-4 w-4" />
            <span>Pen</span>
            <CommandShortcut>P</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onToolChange("rectangle"))}
          >
            <Square className="mr-2 h-4 w-4" />
            <span>Rectangle</span>
            <CommandShortcut>R</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onToolChange("ellipse"))}
          >
            <Circle className="mr-2 h-4 w-4" />
            <span>Ellipse</span>
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onToolChange("diamond"))}
          >
            <Diamond className="mr-2 h-4 w-4" />
            <span>Decision</span>
            <CommandShortcut>D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onToolChange("line"))}>
            <Minus className="mr-2 h-4 w-4" />
            <span>Line</span>
            <CommandShortcut>L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onToolChange("arrow"))}>
            <ArrowRight className="mr-2 h-4 w-4" />
            <span>Arrow</span>
            <CommandShortcut>A</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => onToolChange("arrow-bidirectional"))
            }
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            <span>Bidirectional Arrow</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onToolChange("text"))}>
            <Type className="mr-2 h-4 w-4" />
            <span>Text</span>
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onToolChange("eraser"))}
          >
            <Eraser className="mr-2 h-4 w-4" />
            <span>Eraser</span>
            <CommandShortcut>E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onToolChange("hand"))}>
            <Hand className="mr-2 h-4 w-4" />
            <span>Pan</span>
            <CommandShortcut>H</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Selection">
          <CommandItem onSelect={() => runCommand(() => onAction?.("group"))}>
            <Group className="mr-2 h-4 w-4" />
            <span>Group</span>
            <CommandShortcut>⌘G</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("ungroup"))}>
            <Ungroup className="mr-2 h-4 w-4" />
            <span>Ungroup</span>
            <CommandShortcut>⇧⌘G</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("toggle-lock"))}>
            <Lock className="mr-2 h-4 w-4" />
            <span>Lock / unlock</span>
            <CommandShortcut>⇧⌘L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("align-left"))}>
            <AlignStartVertical className="mr-2 h-4 w-4" />
            <span>Align left</span>
            <CommandShortcut>⌥A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("align-center"))}>
            <AlignCenterVertical className="mr-2 h-4 w-4" />
            <span>Align horizontal centres</span>
            <CommandShortcut>⌥H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("align-right"))}>
            <AlignEndVertical className="mr-2 h-4 w-4" />
            <span>Align right</span>
            <CommandShortcut>⌥D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("align-top"))}>
            <AlignStartHorizontal className="mr-2 h-4 w-4" />
            <span>Align top</span>
            <CommandShortcut>⌥W</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("align-middle"))}>
            <AlignCenterHorizontal className="mr-2 h-4 w-4" />
            <span>Align vertical centres</span>
            <CommandShortcut>⌥V</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("align-bottom"))}>
            <AlignEndHorizontal className="mr-2 h-4 w-4" />
            <span>Align bottom</span>
            <CommandShortcut>⌥S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("distribute-horizontal"))}>
            <AlignHorizontalSpaceBetween className="mr-2 h-4 w-4" />
            <span>Distribute horizontally</span>
            <CommandShortcut>⇧⌥H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("distribute-vertical"))}>
            <AlignVerticalSpaceBetween className="mr-2 h-4 w-4" />
            <span>Distribute vertically</span>
            <CommandShortcut>⇧⌥V</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="View & Canvas">
          <CommandItem onSelect={() => runCommand(() => onAction?.("undo"))}>
            <Undo2 className="mr-2 h-4 w-4" />
            <span>Undo</span>
            <CommandShortcut>⌘Z</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("redo"))}>
            <Redo2 className="mr-2 h-4 w-4" />
            <span>Redo</span>
            <CommandShortcut>⌘Y</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("zoom-in"))}>
            <ZoomIn className="mr-2 h-4 w-4" />
            <span>Zoom In</span>
            <CommandShortcut>⌘+</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("zoom-out"))}
          >
            <ZoomOut className="mr-2 h-4 w-4" />
            <span>Zoom Out</span>
            <CommandShortcut>⌘-</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("zoom-reset"))}
          >
            <Maximize className="mr-2 h-4 w-4" />
            <span>Reset Zoom</span>
            <CommandShortcut>⌘0</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("fit-screen"))}
          >
            <Maximize className="mr-2 h-4 w-4" />
            <span>Fit to Screen</span>
            <CommandShortcut>F</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("toggle-grid"))}
          >
            <Grid3X3 className="mr-2 h-4 w-4" />
            <span>Toggle Grid</span>
            <CommandShortcut>G</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="File">
          <CommandItem onSelect={() => runCommand(() => onAction?.("save"))}>
            <Save className="mr-2 h-4 w-4" />
            <span>Save Whiteboard</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("open-agent"))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Open the AI agent</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("open-code"))}>
            <Code2 className="mr-2 h-4 w-4" />
            <span>Open diagram code</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("insert-icon"))}>
            <Shapes className="mr-2 h-4 w-4" />
            <span>Insert icon…</span>
            <CommandShortcut>I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("export"))}>
            <Download className="mr-2 h-4 w-4" />
            <span>Export…</span>
            <CommandShortcut>⇧⌘E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("copy-image"))}>
            <Copy className="mr-2 h-4 w-4" />
            <span>Copy as image</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("copy-svg"))}>
            <Copy className="mr-2 h-4 w-4" />
            <span>Copy as SVG</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => onAction?.("clear"))}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Clear Canvas</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("shortcuts"))}
          >
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

import React, { useRef, useState } from "react";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";
import { getToolDefinitions, ToolDefinition } from "@/core/shapes/shape-tool-registry";
import {
  MousePointer,
  Eraser,
  Hand,
  Eye,
  Sparkles,
  Code2,
  Shapes,
  RectangleHorizontal,
  MessageSquare,
  Square,
  Circle,
  Diamond,
  Triangle,
  ArrowRight,
  ArrowLeftRight,
  Minus,
  Pencil,
  Type,
  Frame,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { buildToolbar, ICON_PICKER_TOOL, type ToolbarGroup } from "./toolbar-model";

interface SidebarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  disabled?: boolean;
  onOpenAIPanel?: () => void;
  onOpenCodePanel?: () => void;
  onOpenIconPicker?: () => void;
}

const FALLBACK_ICONS: Record<string, React.ElementType> = {
  select: MousePointer,
  eraser: Eraser,
  hand: Hand,
  comment: MessageSquare,
  rectangle: Square,
  pill: RectangleHorizontal,
  ellipse: Circle,
  circle: Circle,
  diamond: Diamond,
  triangle: Triangle,
  arrow: ArrowRight,
  "arrow-bidirectional": ArrowLeftRight,
  line: Minus,
  pen: Pencil,
  text: Type,
  "icon-picker": Shapes,
  frame: Frame,
};
const getToolIcon = (tool: ToolDefinition) => (tool.icon as React.ElementType | null) ?? FALLBACK_ICONS[tool.name] ?? MousePointer;

const buttonBase = "relative w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonState = (active: boolean, off: boolean) =>
  active && !off ? "bg-primary/15 text-primary" : off ? "text-muted-foreground opacity-40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-muted";

const ShortcutHint = ({ children }: { children: React.ReactNode }) => (
  <Kbd className="border-background/25 bg-transparent text-background/70">{children}</Kbd>
);

const LONG_PRESS_MS = 450;

const Sidebar: React.FC<SidebarProps> = ({ currentTool, onToolChange, disabled = false, onOpenAIPanel, onOpenCodePanel, onOpenIconPicker }) => {
  const layout = React.useMemo(() => buildToolbar(getToolDefinitions()), []);
  // The tool each group shows when none of its tools is active: whatever was used last.
  const [lastUsed, setLastUsed] = useState<Record<string, string>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [tipGroup, setTipGroup] = useState<string | null>(null);
  const openedByKey = useRef(false);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  const isOff = (tool: ToolDefinition) => disabled && !tool.allowInReadOnly;

  const renderTool = (tool: ToolDefinition) => {
    const Icon = getToolIcon(tool);
    const off = isOff(tool);
    return (
      <Tooltip key={tool.name}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => !off && onToolChange(tool.name)}
            disabled={off}
            aria-pressed={currentTool === tool.name}
            className={cn(buttonBase, buttonState(currentTool === tool.name, off))}
            aria-label={tool.label}
          >
            <Icon size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className="pointer-events-none flex items-center gap-2">
          <span>{tool.label}</span>
          {tool.shortcut && <ShortcutHint>{tool.shortcut}</ShortcutHint>}
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderGroup = (group: ToolbarGroup) => {
    const active = group.tools.find((t) => t.name === currentTool);
    const shown = active ?? group.tools.find((t) => t.name === lastUsed[group.id]) ?? group.tools[0];
    const Icon = getToolIcon(shown);
    const off = group.tools.every(isOff);
    const open = openGroup === group.id && !off;
    const setOpen = (next: boolean, byKey = false) => {
      if (next) openedByKey.current = byKey;
      setOpenGroup(next ? group.id : null);
      // The menu is the hint now, and a pointer leaving through the menu would never close the tooltip itself.
      setTipGroup(null);
    };
    const choose = (tool: ToolDefinition) => {
      if (tool.name === ICON_PICKER_TOOL.name) return onOpenIconPicker?.();
      setLastUsed((prev) => ({ ...prev, [group.id]: tool.name }));
      onToolChange(tool.name);
    };
    const activate = () => {
      if (off) return;
      if (press.current?.fired) {
        press.current.fired = false;
        return;
      }
      // First click picks the group's tool; clicking it again while active opens the rest.
      if (active) setOpen(!open);
      else choose(shown);
    };
    const cancelPress = () => {
      if (press.current) clearTimeout(press.current.timer);
    };

    return (
      <DropdownMenu key={group.id} open={open} onOpenChange={setOpen}>
        <Tooltip open={tipGroup === group.id && !open} onOpenChange={(next) => setTipGroup(next ? group.id : null)}>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={off}
                aria-label={shown.label}
                aria-haspopup="menu"
                aria-pressed={!!active}
                data-toolbar-group={group.id}
                className={cn(buttonBase, buttonState(!!active, off))}
                onPointerDown={(e) => {
                  // Radix opens on pointerdown; here a click selects, so open only on an explicit second step.
                  e.preventDefault();
                  if (e.pointerType === "touch") {
                    cancelPress();
                    press.current = { fired: false, timer: setTimeout(() => { if (press.current) press.current.fired = true; setOpen(true); }, LONG_PRESS_MS) };
                  }
                }}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onClick={activate}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!off) setOpen(true);
                }}
                onKeyDown={(e) => {
                  if (off) return;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpen(true, true);
                  } else if (e.key === "Enter" || e.key === " ") {
                    // Radix would open the menu; on a group's button these keys pick its tool, like a click.
                    e.preventDefault();
                    activate();
                  }
                }}
              >
                <Icon size={18} />
                <span aria-hidden className="pointer-events-none absolute bottom-[3px] right-[3px] size-0 border-b-[4px] border-l-[4px] border-b-current border-l-transparent opacity-50" />
              </button>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          {!open && (
            <TooltipContent side="right" sideOffset={10} className="pointer-events-none flex flex-col items-start gap-0.5">
              <span className="flex items-center gap-2">
                <span>{shown.label}</span>
                {shown.shortcut && <ShortcutHint>{shown.shortcut}</ShortcutHint>}
              </span>
              <span className="opacity-70">{active ? `Click again for more ${group.label.toLowerCase()}` : `${group.label}: right-click for more`}</span>
            </TooltipContent>
          )}
        </Tooltip>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={10}
          aria-label={group.label}
          className="min-w-44"
          onCloseAutoFocus={(e) => {
            // Handing focus back would pop the button's tooltip over the canvas after a mouse pick; only keyboard users need it.
            e.preventDefault();
            if (openedByKey.current) document.querySelector<HTMLElement>(`[data-toolbar-group="${group.id}"]`)?.focus({ preventScroll: true });
          }}
        >
          {group.tools.map((tool) => {
            const ItemIcon = getToolIcon(tool);
            return (
              <DropdownMenuItem
                key={tool.name}
                disabled={isOff(tool)}
                onSelect={() => choose(tool)}
                data-active={currentTool === tool.name || undefined}
                className={cn("gap-2.5", currentTool === tool.name && "bg-primary/15 text-primary")}
              >
                <ItemIcon size={16} />
                <span>{tool.label}</span>
                {tool.shortcut && <DropdownMenuShortcut>{tool.shortcut}</DropdownMenuShortcut>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderEntries = (entries: typeof layout.create) => entries.map((e) => (e.kind === "group" ? renderGroup(e) : renderTool(e.tool)));

  return (
    <nav
      aria-label="Drawing tools"
      className="absolute left-0 top-0 bottom-0 w-[52px] bg-card border-r border-border flex flex-col items-center py-3 justify-between z-50 pointer-events-auto shadow-popover"
    >
      <div className="flex flex-col items-center gap-1.5 w-full px-2">
        {renderEntries(layout.navigate)}
        <div className="h-px w-6 bg-border my-1.5" />
        {renderEntries(layout.create)}
      </div>

      <div className="flex flex-col items-center gap-1.5 w-full px-2">
        {renderEntries(layout.utility)}
        <div className="h-px w-6 bg-border my-1.5" />
        {/* The two ways to make a diagram without drawing it: write it, or describe it. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onOpenCodePanel} className={cn(buttonBase, buttonState(false, false))} aria-label="Open the diagram code editor">
              <Code2 size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            Diagram code
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenAIPanel}
              disabled={disabled}
              className={cn(
                buttonBase,
                "bg-agent-muted text-agent hover:bg-agent/20 focus-visible:ring-agent",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              aria-label="Open the AI agent"
            >
              <Sparkles size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            AI agent
          </TooltipContent>
        </Tooltip>
        {disabled && (
          <div className="mt-1 text-warning" title="View only" role="img" aria-label="View only">
            <Eye size={16} />
          </div>
        )}
      </div>
    </nav>
  );
};

export default Sidebar;

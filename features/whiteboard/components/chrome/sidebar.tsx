import React from "react";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";
import { getToolDefinitions, ToolDefinition } from "@/core/shapes/shape-tool-registry";
import {
  MousePointer,
  Eraser,
  Hand,
  Sparkles,
  Square,
  Circle,
  Diamond,
  Triangle,
  ArrowRight,
  ArrowLeftRight,
  Minus,
  Pencil,
  Type,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface SidebarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  disabled?: boolean;
  onOpenAIPanel?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentTool,
  onToolChange,
  disabled = false,
  onOpenAIPanel,
}) => {
  const allTools = getToolDefinitions();

  // Helper to map fallback icons for built-in tools
  const getToolIcon = (tool: ToolDefinition) => {
    if (tool.icon) return tool.icon as React.ElementType;
    
    switch (tool.name) {
      case "select":
        return MousePointer;
      case "eraser":
        return Eraser;
      case "hand":
        return Hand;
      case "rectangle":
        return Square;
      case "circle":
        return Circle;
      case "diamond":
        return Diamond;
      case "triangle":
        return Triangle;
      case "arrow":
        return ArrowRight;
      case "arrow-bidirectional":
        return ArrowLeftRight;
      case "line":
        return Minus;
      case "pen":
        return Pencil;
      case "text":
        return Type;
      default:
        return MousePointer;
    }
  };

  // Group tools for structured layout
  const selectTool = allTools.find((t) => t.name === "select");
  const shapeTools = allTools.filter((t) => t.group === "shapes");
  const connectorTools = allTools.filter((t) => t.group === "connectors");
  const drawingTools = allTools.filter((t) => t.group === "drawing");
  const textTool = allTools.find((t) => t.name === "text");
  const bottomTools = allTools.filter(
    (t) => (t.name === "eraser" || t.name === "hand")
  );

  const renderToolButton = (tool: ToolDefinition) => {
    const Icon = getToolIcon(tool);
    const isToolDisabled = disabled && !tool.allowInReadOnly;
    const isActive = currentTool === tool.name;

    return (
      <Tooltip key={tool.name}>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              if (!isToolDisabled) {
                onToolChange(tool.name);
              }
            }}
            disabled={isToolDisabled}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer ${
              isActive && !isToolDisabled
                ? "bg-muted text-foreground ring-1 ring-border"
                : isToolDisabled
                  ? "text-muted-foreground opacity-40 cursor-not-allowed opacity-40"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            aria-label={tool.label}
          >
            <Icon size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="bg-popover border border-border text-foreground flex items-center gap-2">
          <span>{tool.label}</span>
          {tool.shortcut && (
            <kbd className="bg-muted px-1 rounded text-[10px] font-mono">{tool.shortcut}</kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="absolute left-0 top-0 bottom-0 w-[52px] bg-card border-r border-border flex flex-col items-center py-3 justify-between z-50 pointer-events-auto shadow-2xl">
      {/* Top tools section */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* AI sparkle button at the top */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenAIPanel}
              disabled={disabled}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all bg-violet-600 text-foreground hover:bg-violet-500 shadow-lg cursor-pointer ${
                disabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-label="Generate AI Diagram"
            >
              <Sparkles size={18} className="animate-pulse" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="bg-popover border border-border text-foreground">
            Generate AI Diagram ✨
          </TooltipContent>
        </Tooltip>

        <div className="h-px w-6 bg-muted my-1" />

        {/* Select Tool */}
        {selectTool && renderToolButton(selectTool)}

        <div className="h-px w-6 bg-muted my-1" />

        {/* Shapes Group */}
        <div className="flex flex-col gap-1.5 w-full items-center">
          {shapeTools.map(renderToolButton)}
        </div>

        <div className="h-px w-6 bg-muted my-1" />

        {/* Connectors Group */}
        <div className="flex flex-col gap-1.5 w-full items-center">
          {connectorTools.map(renderToolButton)}
        </div>

        <div className="h-px w-6 bg-muted my-1" />

        {/* Drawing & Text Group */}
        <div className="flex flex-col gap-1.5 w-full items-center">
          {drawingTools.map(renderToolButton)}
          {textTool && renderToolButton(textTool)}
        </div>
      </div>

      {/* Bottom section tools */}
      <div className="flex flex-col items-center gap-1.5 w-full px-2">
        <div className="h-px w-6 bg-muted my-1" />
        {bottomTools.map(renderToolButton)}

        {disabled && (
          <div className="mt-2" title="Read-only mode">
            <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;

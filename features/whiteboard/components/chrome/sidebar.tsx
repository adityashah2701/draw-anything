import React from "react";
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
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";

interface SidebarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  disabled?: boolean;
  onOpenAIPanel?: () => void;
  onOpenCodePanel?: () => void;
  onOpenIconPicker?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentTool,
  onToolChange,
  disabled = false,
  onOpenAIPanel,
  onOpenCodePanel,
  onOpenIconPicker,
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
      case "comment":
        return MessageSquare;
      case "rectangle":
        return Square;
      case "pill":
        return RectangleHorizontal;
      case "ellipse":
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
    (t) => (t.name === "comment" || t.name === "eraser" || t.name === "hand")
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
            className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive && !isToolDisabled
                ? "bg-primary/15 text-primary"
                : isToolDisabled
                  ? "text-muted-foreground opacity-40 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            aria-label={tool.label}
          >
            <Icon size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className="flex items-center gap-2">
          <span>{tool.label}</span>
          {tool.shortcut && (
            <Kbd className="border-background/25 bg-transparent text-background/70">{tool.shortcut}</Kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="absolute left-0 top-0 bottom-0 w-[52px] bg-card border-r border-border flex flex-col items-center py-3 justify-between z-50 pointer-events-auto shadow-popover">
      {/* Top tools section */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* The two ways to make a diagram without drawing it: describe it, or write it. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenAIPanel}
              disabled={disabled}
              className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors bg-agent-muted text-agent hover:bg-agent/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agent ${
                disabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-label="Open the AI agent"
            >
              <Sparkles size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            AI agent
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenCodePanel}
              className="w-9 h-9 rounded-md flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open the diagram code editor"
            >
              <Code2 size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            Diagram code
          </TooltipContent>
        </Tooltip>

        <div className="h-px w-6 bg-border my-1" />

        {/* Select Tool */}
        {selectTool && renderToolButton(selectTool)}

        <div className="h-px w-6 bg-border my-1" />

        {/* Shapes Group */}
        <div className="flex flex-col gap-1.5 w-full items-center">
          {shapeTools.map(renderToolButton)}
        </div>

        <div className="h-px w-6 bg-border my-1" />

        {/* Connectors Group */}
        <div className="flex flex-col gap-1.5 w-full items-center">
          {connectorTools.map(renderToolButton)}
        </div>

        <div className="h-px w-6 bg-border my-1" />

        {/* Drawing & Text Group */}
        <div className="flex flex-col gap-1.5 w-full items-center">
          {drawingTools.map(renderToolButton)}
          {textTool && renderToolButton(textTool)}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenIconPicker}
                disabled={disabled}
                className="w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Insert icon"
              >
                <Shapes size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="flex items-center gap-2">
              <span>Insert icon</span>
              <Kbd className="border-background/25 bg-transparent text-background/70">I</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Bottom section tools */}
      <div className="flex flex-col items-center gap-1.5 w-full px-2">
        <div className="h-px w-6 bg-border my-1" />
        {bottomTools.map(renderToolButton)}

        {disabled && (
          <div className="mt-2 text-warning" title="View only" role="img" aria-label="View only">
            <Eye size={16} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;

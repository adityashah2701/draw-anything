import React from "react";
import {
  ArrowRoutingMode,
  ArrowType,
  Tool,
} from "@/features/whiteboard/types/whiteboard.types";
import StrokeWidthSelector from "./stroke-width-selector";
import { ColorSection } from "./properties/color-section";
import { FontSizeSection } from "./properties/font-size-section";
import { StatusSection } from "./properties/status-section";
import { ArrowSection } from "./properties/arrow-section";

interface PropertiesPanelProps {
  currentTool: Tool;
  currentColor: string;
  strokeWidth: number;
  fillColor: string;
  fontSize: number;
  showOutlineColorPicker: boolean;
  showFillColorPicker: boolean;
  onColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onToggleOutlineColorPicker: () => void;
  onToggleFillColorPicker: () => void;
  onStrokeWidthChange: (width: number) => void;
  onFontSizeChange: (size: number) => void;
  selectedArrow:
    | {
        type: ArrowType;
        routingMode: ArrowRoutingMode;
        dashed: boolean;
        arrowHeadStart: boolean;
        arrowHeadEnd: boolean;
      }
    | null;
  onArrowTypeChange: (type: ArrowType) => void;
  onArrowRoutingModeChange: (mode: ArrowRoutingMode) => void;
  onArrowDashedChange: (value: boolean) => void;
  onArrowHeadStartChange: (value: boolean) => void;
  onArrowHeadEndChange: (value: boolean) => void;
  disabled?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  currentTool,
  currentColor,
  strokeWidth,
  fillColor,
  fontSize,
  showOutlineColorPicker,
  showFillColorPicker,
  onColorChange,
  onFillColorChange,
  onToggleOutlineColorPicker,
  onToggleFillColorPicker,
  onStrokeWidthChange,
  onFontSizeChange,
  selectedArrow,
  onArrowTypeChange,
  onArrowRoutingModeChange,
  onArrowDashedChange,
  onArrowHeadStartChange,
  onArrowHeadEndChange,
  disabled = false,
  isSaving = false,
  lastSaved = null,
}) => {
  // Tools that should show color controls (including select for changing selected elements)
  const colorTools = [
    "pen",
    "rectangle",
    "circle",
    "diamond",
    "line",
    "arrow",
    "arrow-bidirectional",
    "text",
    "select",
  ];
  const showColorControls = colorTools.includes(currentTool);

  // Tools that support fill
  const fillableTools = ["rectangle", "circle", "diamond"];
  const showFillControls =
    fillableTools.includes(currentTool) || currentTool === "select";

  // Tools that need stroke width
  const strokeTools = [
    "pen",
    "rectangle",
    "circle",
    "diamond",
    "line",
    "arrow",
    "arrow-bidirectional",
    "text",
  ];
  const showStrokeControls =
    strokeTools.includes(currentTool) || currentTool === "select";

  const toolLabel =
    currentTool === "pen"
      ? "Pen"
      : currentTool === "rectangle"
        ? "Rectangle"
        : currentTool === "circle"
          ? "Circle"
          : currentTool === "diamond"
            ? "Decision"
            : currentTool === "line"
              ? "Line"
              : currentTool === "arrow"
                ? "Arrow"
                : currentTool === "arrow-bidirectional"
                  ? "Bi Arrow"
                  : currentTool === "text"
                    ? "Text"
                    : currentTool === "eraser"
                      ? "Eraser"
                      : currentTool === "hand"
                        ? "Pan"
                        : "Select";

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-lg backdrop-blur-md ${
        disabled ? "opacity-75" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-3 text-white">
          <span className="h-2 w-2 rounded-full bg-cyan-300" />
          <span className="text-xs font-semibold tracking-wide uppercase">
            {toolLabel}
          </span>
        </div>

        {disabled && (
          <div className="inline-flex h-9 items-center rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800">
            Read-only
          </div>
        )}

        {showColorControls && !disabled && (
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1">
            <ColorSection
              currentColor={currentColor}
              fillColor={fillColor}
              showOutlineColorPicker={showOutlineColorPicker}
              showFillColorPicker={showFillColorPicker}
              onColorChange={onColorChange}
              onFillColorChange={onFillColorChange}
              onToggleOutlineColorPicker={onToggleOutlineColorPicker}
              onToggleFillColorPicker={onToggleFillColorPicker}
              disabled={disabled}
              showFillControls={showFillControls}
              isSelectMode={currentTool === "select"}
            />

            {showStrokeControls && (
              <StrokeWidthSelector
                strokeWidth={strokeWidth}
                onStrokeWidthChange={onStrokeWidthChange}
                disabled={disabled}
              />
            )}

            {(currentTool === "text" || currentTool === "select") && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
                <FontSizeSection
                  fontSize={fontSize}
                  onFontSizeChange={onFontSizeChange}
                  disabled={disabled}
                />
              </div>
            )}

            {selectedArrow && (
              <ArrowSection
                arrowType={selectedArrow.type}
                routingMode={selectedArrow.routingMode}
                dashed={selectedArrow.dashed}
                arrowHeadStart={selectedArrow.arrowHeadStart}
                arrowHeadEnd={selectedArrow.arrowHeadEnd}
                onArrowTypeChange={onArrowTypeChange}
                onRoutingModeChange={onArrowRoutingModeChange}
                onDashedChange={onArrowDashedChange}
                onArrowHeadStartChange={onArrowHeadStartChange}
                onArrowHeadEndChange={onArrowHeadEndChange}
                disabled={disabled}
              />
            )}
          </div>
        )}

        {!showColorControls && !disabled && (
          <div className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
            {currentTool === "hand"
              ? "Pan mode"
              : currentTool === "eraser"
                ? "Eraser mode"
                : "No properties"}
          </div>
        )}

        <div className="ml-auto">
          <StatusSection
            currentTool={currentTool}
            isSaving={isSaving}
            lastSaved={lastSaved}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;

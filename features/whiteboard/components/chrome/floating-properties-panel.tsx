import React from "react";
import {
  ArrowRoutingMode,
  ArrowType,
  Tool,
} from "@/features/whiteboard/types/whiteboard.types";
import StrokeWidthSelector from "../properties/stroke-width-selector";
import { ColorSection } from "../properties/color-section";
import { FontSizeSection } from "../properties/font-size-section";
import { ArrowSection } from "../properties/arrow-section";

interface FloatingPropertiesPanelProps {
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
  hasSelection: boolean;
}

const FloatingPropertiesPanel: React.FC<FloatingPropertiesPanelProps> = ({
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
  hasSelection,
}) => {
  if (!hasSelection) return null;

  // Determine what controls to show based on selected elements
  // We can show colors for all selectable elements
  const showColorControls = true;
  const showFillControls = currentTool !== "line" && currentTool !== "arrow" && currentTool !== "arrow-bidirectional" && currentTool !== "text";
  const showStrokeControls = currentTool !== "text";
  const showFontControls = currentTool === "text" || currentTool === "select";

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 text-foreground pointer-events-auto flex items-center gap-2 ${
        disabled ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {showColorControls && !disabled && (
          <div className="flex items-center gap-2 px-1">
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
              <div className="border-l border-border pl-2">
                <StrokeWidthSelector
                  strokeWidth={strokeWidth}
                  onStrokeWidthChange={onStrokeWidthChange}
                  disabled={disabled}
                />
              </div>
            )}

            {showFontControls && (
              <div className="border-l border-border pl-2">
                <FontSizeSection
                  fontSize={fontSize}
                  onFontSizeChange={onFontSizeChange}
                  disabled={disabled}
                />
              </div>
            )}

            {selectedArrow && (
              <div className="border-l border-border pl-2">
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
              </div>
            )}
          </div>
        )}

        {disabled && (
          <div className="text-xs text-muted-foreground px-2">Read Only Mode</div>
        )}
      </div>
    </div>
  );
};

export default FloatingPropertiesPanel;

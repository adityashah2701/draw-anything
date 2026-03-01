import React from "react";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";
import StrokeWidthSelector from "./stroke-width-selector";
import { ColorSection } from "./properties/color-section";
import { FontSizeSection } from "./properties/font-size-section";
import { StatusSection } from "./properties/status-section";

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
    "text",
  ];
  const showStrokeControls =
    strokeTools.includes(currentTool) || currentTool === "select";

  return (
    <div
      className={`bg-white/90 backdrop-blur-md border border-gray-200/50 p-2 sm:px-4 sm:py-2.5 shadow-sm rounded-2xl ${
        disabled ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-center justify-between space-x-2 sm:space-x-4 min-w-0">
        {/* Left side: Tool properties */}
        <div className="flex items-center space-x-2 sm:space-x-6 min-w-0 flex-1">
          {/* Read-only indicator */}
          {disabled && (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-yellow-100 border border-yellow-300 rounded-lg flex-shrink-0">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="text-xs text-yellow-800 font-medium">
                Read-only
              </span>
            </div>
          )}

          {/* Selection mode indicator */}
          {currentTool === "select" && !disabled && (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg flex-shrink-0">
              <svg
                className="w-3 h-3 text-blue-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-blue-700 font-medium">
                Selection Mode
              </span>
            </div>
          )}

          {showColorControls && !disabled && (
            <div className="flex items-center space-x-3 sm:space-x-5 min-w-0 overflow-x-auto">
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
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className="text-xs text-gray-600 hidden sm:inline font-medium">
                    Width:
                  </span>
                  <StrokeWidthSelector
                    strokeWidth={strokeWidth}
                    onStrokeWidthChange={onStrokeWidthChange}
                    disabled={disabled}
                  />
                </div>
              )}

              {(currentTool === "text" || currentTool === "select") && (
                <FontSizeSection
                  fontSize={fontSize}
                  onFontSizeChange={onFontSizeChange}
                  disabled={disabled}
                />
              )}
            </div>
          )}

          {!showColorControls && !disabled && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <span className="text-xs text-gray-500">
                {currentTool === "hand"
                  ? "Pan mode - Navigate the canvas"
                  : currentTool === "eraser"
                    ? "Eraser mode - Click to delete elements"
                    : "No properties for this tool"}
              </span>
            </div>
          )}

          {disabled && (
            <span className="text-xs text-gray-500">
              Properties not available in read-only mode
            </span>
          )}
        </div>

        <StatusSection
          currentTool={currentTool}
          isSaving={isSaving}
          lastSaved={lastSaved}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default PropertiesPanel;

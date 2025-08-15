import React from "react";
import { Tool } from "@/types/whiteboard.types";
import StrokeWidthSelector from "./stroke-width-selector";
import ColorPicker from "./color-picker";

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
    "line",
    "arrow",
    "text",
    "select",
  ];
  const showColorControls = colorTools.includes(currentTool);

  // Tools that support fill
  const fillableTools = ["rectangle", "circle"];
  const showFillControls =
    fillableTools.includes(currentTool) || currentTool === "select";

  // Tools that need stroke width
  const strokeTools = ["pen", "rectangle", "circle", "line", "arrow", "text"];
  const showStrokeControls =
    strokeTools.includes(currentTool) || currentTool === "select";

  return (
    <div
      className={`bg-white border-b border-gray-200 p-2 sm:p-4 ${
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

          {/* Show color controls for relevant tools */}
          {showColorControls && !disabled && (
            <div className="flex items-center space-x-3 sm:space-x-5 min-w-0 overflow-x-auto">
              {/* Outline/Stroke Color Picker */}
              <div data-color-picker="outline">
                <ColorPicker
                  id="outline-color-picker"
                  currentColor={currentColor}
                  showColorPicker={showOutlineColorPicker}
                  onColorChange={onColorChange}
                  onTogglePicker={onToggleOutlineColorPicker}
                  disabled={disabled}
                  label={
                    currentTool === "select"
                      ? "Outline"
                      : showFillControls
                        ? "Outline"
                        : "Color"
                  }
                  size="md"
                />
              </div>
              
              {/* Fill Color Picker - Only for fillable shapes or select mode */}
              {showFillControls && (
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {fillColor !== "#transparent" ? (
                    <div data-color-picker="fill">
                      <ColorPicker
                        id="fill-color-picker"
                        currentColor={fillColor}
                        showColorPicker={showFillColorPicker}
                        onColorChange={onFillColorChange}
                        onTogglePicker={onToggleFillColorPicker}
                        disabled={disabled}
                        label="Fill"
                        size="md"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-600 hidden sm:inline font-medium">
                        Fill:
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          if (!disabled) {
                            onFillColorChange("#ffffff");
                          }
                        }}
                        disabled={disabled}
                        className={`w-8 h-8 rounded-lg border-2 flex-shrink-0 relative overflow-hidden ${
                          disabled
                            ? "border-gray-200 cursor-not-allowed opacity-60"
                            : "border-gray-300 cursor-pointer hover:border-gray-400 hover:shadow-md transition-all"
                        }`}
                        title="Enable fill"
                        aria-label="Enable fill color"
                      >
                        {/* Transparent pattern */}
                        <div
                          className="w-full h-full"
                          style={{
                            backgroundImage:
                              "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
                            backgroundSize: "6px 6px",
                            backgroundPosition:
                              "0 0, 0 3px, 3px -3px, -3px 0px",
                          }}
                        />
                        {/* Plus icon */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Fill Toggle */}
                  {fillColor !== "#transparent" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (!disabled) {
                          onFillColorChange("#transparent");
                        }
                      }}
                      disabled={disabled}
                      className={`px-2 py-1 rounded-md border transition-colors text-xs ${
                        disabled
                          ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                      }`}
                      title="Remove fill"
                      aria-label="Remove fill color"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Stroke Width */}
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

              {/* Font Size */}
              {(currentTool === "text" || currentTool === "select") && (
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className="text-xs text-gray-600 hidden sm:inline font-medium">
                    Size:
                  </span>
                  <select
                    id="font-size-selector"
                    name="font-size"
                    value={fontSize}
                    onChange={(e) => onFontSizeChange(Number(e.target.value))}
                    disabled={disabled}
                    className={`border rounded-lg px-3 py-1.5 text-xs ${
                      disabled
                        ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    }`}
                    title="Select font size"
                  >
                    <option value={12}>12px</option>
                    <option value={16}>16px</option>
                    <option value={20}>20px</option>
                    <option value={24}>24px</option>
                    <option value={32}>32px</option>
                    <option value={48}>48px</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Show message for non-interactive tools */}
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

          {/* Show message when disabled */}
          {disabled && (
            <span className="text-xs text-gray-500">
              Properties not available in read-only mode
            </span>
          )}
        </div>

        {/* Right side: Status indicators */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Current tool display */}
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-700 capitalize font-medium">
              {currentTool === "pen"
                ? "Pen"
                : currentTool === "rectangle"
                  ? "Rectangle"
                  : currentTool === "circle"
                    ? "Circle"
                    : currentTool === "line"
                      ? "Line"
                      : currentTool === "arrow"
                        ? "Arrow"
                        : currentTool === "text"
                          ? "Text"
                          : currentTool === "eraser"
                            ? "Eraser"
                            : currentTool === "select"
                              ? "Select"
                              : currentTool === "hand"
                                ? "Pan"
                                : currentTool}
            </span>
          </div>

          {/* Save Status */}
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            {isSaving ? (
              <>
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-700 font-medium hidden sm:inline">
                  Saving...
                </span>
              </>
            ) : lastSaved ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-700 hidden sm:inline">
                  {lastSaved.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-xs text-gray-700 hidden sm:inline">
                  {disabled ? "Read-only" : "Not saved"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
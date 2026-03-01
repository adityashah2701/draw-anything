import React from "react";
import ColorPicker from "../color-picker";

interface ColorSectionProps {
  currentColor: string;
  fillColor: string;
  showOutlineColorPicker: boolean;
  showFillColorPicker: boolean;
  onColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onToggleOutlineColorPicker: () => void;
  onToggleFillColorPicker: () => void;
  disabled: boolean;
  showFillControls: boolean;
  isSelectMode: boolean;
}

export const ColorSection: React.FC<ColorSectionProps> = ({
  currentColor,
  fillColor,
  showOutlineColorPicker,
  showFillColorPicker,
  onColorChange,
  onFillColorChange,
  onToggleOutlineColorPicker,
  onToggleFillColorPicker,
  disabled,
  showFillControls,
  isSelectMode,
}) => {
  return (
    <>
      <div data-color-picker="outline">
        <ColorPicker
          id="outline-color-picker"
          currentColor={currentColor}
          showColorPicker={showOutlineColorPicker}
          onColorChange={onColorChange}
          onTogglePicker={onToggleOutlineColorPicker}
          disabled={disabled}
          label={
            isSelectMode ? "Outline" : showFillControls ? "Outline" : "Color"
          }
          size="md"
        />
      </div>

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
                  if (!disabled) onFillColorChange("#ffffff");
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
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
                    backgroundSize: "6px 6px",
                    backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0px",
                  }}
                />
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

          {fillColor !== "#transparent" && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (!disabled) onFillColorChange("#transparent");
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
    </>
  );
};

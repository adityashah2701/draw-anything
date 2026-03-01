import React from "react";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";

interface StatusSectionProps {
  currentTool: Tool;
  isSaving: boolean;
  lastSaved: Date | null;
  disabled: boolean;
}

export const StatusSection: React.FC<StatusSectionProps> = ({
  currentTool,
  isSaving,
  lastSaved,
  disabled,
}) => {
  return (
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
              : currentTool === "diamond"
                ? "Decision"
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
  );
};

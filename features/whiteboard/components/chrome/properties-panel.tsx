/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { shapeRegistry } from "@/core/shapes/shape-registry";
import {
  ArrowRoutingMode,
  ArrowType,
  Tool,
} from "@/features/whiteboard/types/whiteboard.types";
import StrokeWidthSelector from "../properties/stroke-width-selector";
import { ColorSection } from "../properties/color-section";
import { FontSizeSection } from "../properties/font-size-section";
import { StatusSection } from "../properties/status-section";
import { ArrowSection } from "../properties/arrow-section";

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
  const shapeDef = shapeRegistry.get(currentTool as any);
  const toolConfig = shapeDef?.propertiesConfig;
  const labelConfig = shapeDef?.toolbarConfig;

  // Tools that should show color controls (including select for changing selected elements)
  const showColorControls = toolConfig?.supportsColor || currentTool === "select" || currentTool === "pen";

  // Tools that support fill
  const showFillControls =
    toolConfig?.supportsFill || currentTool === "select";

  // Tools that need stroke width
  const showStrokeControls =
    toolConfig?.supportsStrokeWidth || currentTool === "select" || currentTool === "pen";

  const toolLabel = labelConfig?.label ??
    (currentTool === "pen"
      ? "Pen"
      : currentTool === "eraser"
        ? "Eraser"
        : currentTool === "hand"
          ? "Pan"
          : currentTool === "select"
            ? "Select"
            : "Tool");

  return (
    <div
      className={`rounded-2xl border border-border bg-surface/95 p-2 shadow-lg backdrop-blur-md ${
        disabled ? "opacity-75" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-primary-foreground">
          <span className="h-2 w-2 rounded-full bg-cyan-300" />
          <span className="text-xs font-semibold tracking-wide uppercase">
            {toolLabel}
          </span>
        </div>

        {disabled && (
          <div className="inline-flex h-9 items-center rounded-xl border border-warning/50 bg-warning/10 px-3 text-xs font-medium text-warning">
            Read-only
          </div>
        )}

        {showColorControls && !disabled && (
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-2 py-1">
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
              <div className="rounded-xl border border-border bg-background px-2 py-1">
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
          <div className="inline-flex h-9 items-center rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground">
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

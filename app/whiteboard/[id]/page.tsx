"use client";

import useCanvasEngine from "@/components/custom/whiteboard/canvas-drawing";
import KeyboardShortcuts from "@/components/custom/whiteboard/keyboard-shprtcuts";
import PropertiesPanel from "@/components/custom/whiteboard/properties-panel";
import Sidebar from "@/components/custom/whiteboard/sidebar";
import TextInputModal from "@/components/custom/whiteboard/text-input-modal";
import TopToolbar from "@/components/custom/whiteboard/top-toolbar";
import { Tool } from "@/types/whiteboard.types";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

// Import all custom hooks
import {
  useWhiteboardState,
  useWhiteboardAccess,
  useCanvasViewport,
  useWhiteboardUtils,
  useWhiteboardDrawing,
  useWhiteboardKeyboard,
  useWhiteboardAutoSave,
} from "@/hooks/index";

const WhiteboardCanvas: React.FC = () => {
  const params = useParams();
  const whiteboardId = params.id as string;

  const whiteboard = useQuery(
    api.whiteboard.getById,
    whiteboardId ? { id: whiteboardId as Id<"whiteboards"> } : "skip"
  );

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Tool and drawing settings state (kept in component for simplicity)
  const [currentTool, setCurrentTool] = useState<Tool>("pen");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState("#transparent");
  const [fontSize, setFontSize] = useState(16);
  const [eraserSize, setEraserSize] = useState(20);

  // UI state
  const [textInput, setTextInput] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showOutlineColorPicker, setShowOutlineColorPicker] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);

  // Initialize all custom hooks
  const whiteboardState = useWhiteboardState();
  const whiteboardAccess = useWhiteboardAccess(whiteboard);
  const canvasViewport = useCanvasViewport();
  const whiteboardUtils = useWhiteboardUtils(
    canvasViewport.zoom,
    whiteboardState.elements,
    whiteboardState.setElements
  );

  const whiteboardDrawing = useWhiteboardDrawing({
    currentTool,
    currentColor,
    strokeWidth,
    fillColor,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    getMousePosition: canvasViewport.getMousePosition,
    generateId: whiteboardUtils.generateId,
    getElementsAtPoint: whiteboardUtils.getElementsAtPoint,
    getResizeHandle: whiteboardUtils.getResizeHandle,
    deleteElements: whiteboardUtils.deleteElements,
    moveElements: whiteboardUtils.moveElements,
    resizeElement: whiteboardUtils.resizeElement,
    getElementBounds: whiteboardUtils.getElementBounds,
    currentElement: whiteboardState.currentElement,
    setCurrentElement: whiteboardState.updateCurrentElement,
    selectedElements: whiteboardState.selectedElements,
    setSelectedElements: whiteboardState.selectElements,
    elements: whiteboardState.elements,
    completeCurrentElement: whiteboardState.completeCurrentElement,
    saveToHistory: whiteboardState.saveToHistory,
    startPanning: canvasViewport.startPanning,
    handlePan: canvasViewport.handlePan,
    stopPanning: canvasViewport.stopPanning,
  });

  const whiteboardAutoSave = useWhiteboardAutoSave({
    whiteboardId,
    elements: whiteboardState.elements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    isDrawing: whiteboardDrawing.isDrawing,
    currentElement: whiteboardState.currentElement,
    zoom: canvasViewport.zoom,
    panOffset: canvasViewport.panOffset,
    showGrid: canvasViewport.showGrid,
    whiteboard,
  });

  // Keyboard shortcuts hook
  useWhiteboardKeyboard({
    currentTool,
    setCurrentTool,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    handleUndo: whiteboardState.handleUndo,
    handleRedo: whiteboardState.handleRedo,
    saveWhiteboard: whiteboardAutoSave.saveWhiteboard,
    selectAllElements: whiteboardState.selectAllElements,
    deleteSelectedElements: useCallback(() => {
      if (whiteboardState.selectedElements.length > 0) {
        whiteboardUtils.deleteElements(whiteboardState.selectedElements);
        whiteboardState.clearSelection();
        whiteboardState.saveToHistory();
      }
    }, [whiteboardState.selectedElements, whiteboardUtils.deleteElements, whiteboardState.clearSelection, whiteboardState.saveToHistory]),
    clearSelection: whiteboardState.clearSelection,
    handleZoomIn: canvasViewport.handleZoomIn,
    handleZoomOut: canvasViewport.handleZoomOut,
    handleResetZoom: canvasViewport.handleResetZoom,
    toggleGrid: canvasViewport.toggleGrid,
    setShowShortcuts,
  });

  // Load whiteboard content when data is fetched
  useEffect(() => {
    if (whiteboard?.content) {
      const whiteboardData = whiteboardAutoSave.loadWhiteboardContent(whiteboard.content);
      if (whiteboardData) {
        whiteboardState.loadElements(whiteboardData.elements || []);

        // Restore canvas settings if available
        if (whiteboardData.canvasSettings) {
          canvasViewport.loadViewportSettings(whiteboardData.canvasSettings);
        }
      }
    }
  }, [whiteboard, whiteboardAutoSave.loadWhiteboardContent, whiteboardState.loadElements, canvasViewport.loadViewportSettings]);

  // Initialize canvas engine
  useCanvasEngine({
    canvasRef,
    elements: whiteboardState.elements,
    currentElement: whiteboardState.currentElement,
    zoom: canvasViewport.zoom,
    panOffset: canvasViewport.panOffset,
    showGrid: canvasViewport.showGrid,
    canvasSize: canvasViewport.canvasSize,
    selectedElements: whiteboardState.selectedElements,
    onElementSelect: (elementId: string) => {
      whiteboardState.toggleElementSelection(elementId);
    },
    getElementBounds: whiteboardUtils.getElementBounds,
  });

  // Load whiteboard data (simulated)
  const loadWhiteboard = useCallback(() => {
    console.log("=== LOAD WHITEBOARD ===");
    console.log("This whiteboard is automatically loaded from the database.");
    console.log("Current whiteboard ID:", whiteboardId);
    console.log("=== END LOAD INFO ===");

    toast.success("This whiteboard is automatically loaded from the database!");
  }, [whiteboardId]);

  // Color change handlers
  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    setShowOutlineColorPicker(false);
  };

  const handleFillColorChange = (color: string) => {
    setFillColor(color);
    setShowFillColorPicker(false);
  };

  const handleToggleOutlineColorPicker = () => {
    setShowFillColorPicker(false);
    setShowOutlineColorPicker(!showOutlineColorPicker);
  };

  const handleToggleFillColorPicker = () => {
    setShowOutlineColorPicker(false);
    setShowFillColorPicker(!showFillColorPicker);
  };

  // Text input handlers
  const handleTextSubmit = useCallback(() => {
    const success = whiteboardDrawing.handleTextSubmit(textInput, fontSize);
    if (success) {
      setTextInput("");
    }
  }, [whiteboardDrawing.handleTextSubmit, textInput, fontSize]);

  const handleTextCancel = () => {
    whiteboardDrawing.handleTextCancel();
    setTextInput("");
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        disabled={!whiteboardAccess.hasEditAccess}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopToolbar
          historyStep={whiteboardState.historyStep}
          historyLength={whiteboardState.history.length}
          zoom={canvasViewport.zoom}
          showGrid={canvasViewport.showGrid}
          whiteboardTitle={whiteboard?.title || whiteboard?.title}
          onUndo={whiteboardState.handleUndo}
          onRedo={whiteboardState.handleRedo}
          onClear={whiteboardState.handleClear}
          onZoomIn={canvasViewport.handleZoomIn}
          onZoomOut={canvasViewport.handleZoomOut}
          onResetZoom={canvasViewport.handleResetZoom}
          onToggleGrid={canvasViewport.toggleGrid}
          onSave={whiteboardAutoSave.saveWhiteboard}
          onLoad={loadWhiteboard}
          disabled={!whiteboardAccess.hasEditAccess}
        />

        <PropertiesPanel
          currentTool={currentTool}
          currentColor={currentColor}
          strokeWidth={strokeWidth}
          fillColor={fillColor}
          fontSize={fontSize}
          showOutlineColorPicker={showOutlineColorPicker}
          showFillColorPicker={showFillColorPicker}
          onColorChange={handleColorChange}
          onFillColorChange={handleFillColorChange}
          onToggleOutlineColorPicker={handleToggleOutlineColorPicker}
          onToggleFillColorPicker={handleToggleFillColorPicker}
          onStrokeWidthChange={setStrokeWidth}
          onFontSizeChange={setFontSize}
          disabled={!whiteboardAccess.hasEditAccess}
          isSaving={whiteboardAutoSave.isSaving}
          lastSaved={whiteboardAutoSave.lastSaved}
        />

        <div className="flex-1 relative overflow-hidden bg-gray-50">
          {/* Access Status Indicator */}
          {!whiteboardAccess.hasEditAccess && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-100 border border-yellow-300 rounded-lg p-2 z-20 max-w-[90vw]">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0"></div>
                <span className="text-sm text-yellow-800 truncate">
                  Read-only mode - You don't have edit access to this whiteboard
                </span>
              </div>
            </div>
          )}

          {/* Selection Info */}
          {whiteboardState.hasSelection && (
            <div className="absolute top-4 left-4 bg-blue-100 border border-blue-300 rounded-lg p-2 z-10 max-w-[300px]">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-blue-800 flex-shrink-0">
                  {whiteboardState.selectedElements.length} element
                  {whiteboardState.selectedElements.length > 1 ? "s" : ""} selected
                </span>
                {whiteboardAccess.hasEditAccess && (
                  <button
                    onClick={() => {
                      whiteboardUtils.deleteElements(whiteboardState.selectedElements);
                      whiteboardState.clearSelection();
                      whiteboardState.saveToHistory();
                    }}
                    className="ml-2 px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 flex-shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Loading State */}
          {!whiteboard && whiteboardId && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75 z-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading whiteboard...</p>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={canvasViewport.canvasSize.width}
            height={canvasViewport.canvasSize.height}
            onMouseDown={whiteboardDrawing.startDrawing}
            onMouseMove={(e) => {
              whiteboardDrawing.draw(e);

              // Update eraser cursor position
              if (currentTool === "eraser" && whiteboardAccess.hasEditAccess) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                  const eraserCursor = document.getElementById("eraser-cursor");
                  if (eraserCursor) {
                    eraserCursor.style.left =
                      e.clientX - rect.left - eraserSize / 2 + "px";
                    eraserCursor.style.top =
                      e.clientY - rect.top - eraserSize / 2 + "px";
                  }
                }
              }
            }}
            onMouseUp={whiteboardDrawing.stopDrawing}
            onMouseLeave={whiteboardDrawing.stopDrawing}
            onMouseEnter={(e) => {
              if (currentTool === "eraser" && whiteboardAccess.hasEditAccess) {
                const eraserCursor = document.getElementById("eraser-cursor");
                if (eraserCursor) {
                  eraserCursor.style.display = "block";
                }
              }
            }}
            className="cursor-crosshair"
            style={{
              cursor:
                currentTool === "hand"
                  ? "grab"
                  : currentTool === "select"
                    ? "default"
                    : currentTool === "eraser" && whiteboardAccess.hasEditAccess
                      ? "none"
                      : whiteboardAccess.hasEditAccess
                        ? "crosshair"
                        : "not-allowed",
            }}
          />

          {/* Eraser cursor */}
          {currentTool === "eraser" && whiteboardAccess.hasEditAccess && (
            <div
              id="eraser-cursor"
              className="absolute pointer-events-none border-2 border-red-500 rounded-full bg-red-100 opacity-50 z-10"
              style={{
                width: eraserSize,
                height: eraserSize,
                display: "none",
              }}
            />
          )}

          <KeyboardShortcuts
            isOpen={showShortcuts}
            onClose={() => setShowShortcuts(false)}
          />

          <TextInputModal
            textPosition={whiteboardDrawing.textPosition}
            textInput={textInput}
            zoom={canvasViewport.zoom}
            panOffset={canvasViewport.panOffset}
            onTextChange={setTextInput}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
            disabled={!whiteboardAccess.hasEditAccess}
          />
        </div>
      </div>
    </div>
  );
};

export default WhiteboardCanvas;
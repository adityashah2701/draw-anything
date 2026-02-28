"use client";

import * as React from "react";

import useCanvasEngine from "@/features/whiteboard/components/canvas-drawing";
import KeyboardShortcuts from "@/features/whiteboard/components/keyboard-shortcuts";
import PropertiesPanel from "@/features/whiteboard/components/properties-panel";
import Sidebar from "@/features/whiteboard/components/sidebar";
import CanvasTextBlock from "@/features/whiteboard/components/canvas-text-block";
import TopToolbar from "@/features/whiteboard/components/top-toolbar";
import { CommandMenu } from "@/features/whiteboard/components/command-menu";
import {
  DrawingElement,
  Tool,
} from "@/features/whiteboard/types/whiteboard.types";
import { DrawingElementJson } from "@/liveblocks.config";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { LiveList, LiveObject } from "@liveblocks/client";

// Import all custom hooks
import {
  useWhiteboardAccess,
  useCanvasViewport,
  useWhiteboardUtils,
  useWhiteboardDrawing,
  useWhiteboardKeyboard,
  useWhiteboardAutoSave,
} from "@/hooks";
import {
  RoomProvider,
  useUpdateMyPresence,
  useStorage,
  useMutation as useLiveblocksM,
  useHistory,
  useCanUndo,
  useCanRedo,
  useOthers,
} from "@/liveblocks.config";
import { ClientSideSuspense } from "@liveblocks/react";
import { Cursors } from "@/features/whiteboard/components/cursors";

const WhiteboardCanvas: React.FC = () => {
  const params = useParams();
  const whiteboardId = params.id as string;

  const whiteboard = useQuery(
    api.whiteboard.getById,
    whiteboardId ? { id: whiteboardId as Id<"whiteboards"> } : "skip",
  );

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Tool and drawing settings state
  const [currentTool, setCurrentTool] = useState<Tool>("pen");
  const updateWhiteboard = useMutation(api.whiteboard.update);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState("#transparent");
  const [fontSize, setFontSize] = useState(16);
  const [eraserSize, setEraserSize] = useState(20);

  // UI state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showOutlineColorPicker, setShowOutlineColorPicker] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);
  const seededRef = useRef(false);

  // Inline text editing state
  // isNewTextElement = true means the element has NOT yet been persisted to Liveblocks
  // We defer addElement until the user commits, so blur/click-away never creates garbage elements
  const [editingTextElement, setEditingTextElement] =
    useState<DrawingElement | null>(null);
  const [isNewTextElement, setIsNewTextElement] = useState(false);
  const currentColorRef = useRef(currentColor);
  const strokeWidthRef = useRef(strokeWidth);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => {
    currentColorRef.current = currentColor;
  }, [currentColor]);
  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  // Liveblocks presence
  const updateMyPresence = useUpdateMyPresence();

  // ── Liveblocks Storage ──────────────────────────────────────────────────────
  // Read elements from shared LiveList (real-time, all users)
  const liveElements = useStorage((root) => root.elements);
  // Derived plain array for canvas rendering
  const elements: DrawingElement[] = liveElements
    ? liveElements.map(
        (el: DrawingElementJson) => el as unknown as DrawingElement,
      )
    : [];

  // Mutation: add a single completed element
  const addElement = useLiveblocksM(
    ({ storage }, element: DrawingElementJson) => {
      storage.get("elements").push(new LiveObject(element));
    },
    [],
  );

  // Mutation: delete elements by id
  const deleteElementsLive = useLiveblocksM(({ storage }, ids: string[]) => {
    const list = storage.get("elements");
    for (let i = list.length - 1; i >= 0; i--) {
      if (ids.includes(list.get(i)!.get("id") as string)) {
        list.delete(i);
      }
    }
  }, []);

  // Mutation: update element properties (move/resize)
  const updateElement = useLiveblocksM(
    ({ storage }, updatedElement: DrawingElementJson) => {
      const list = storage.get("elements");
      for (let i = 0; i < list.length; i++) {
        if (list.get(i)!.get("id") === updatedElement.id) {
          list.get(i)!.update(updatedElement);
          break;
        }
      }
    },
    [],
  );

  // Mutation: replace entire list — used for seeding from Convex
  const seedElements = useLiveblocksM(
    ({ storage }, initial: DrawingElementJson[]) => {
      const list = storage.get("elements");
      if (list.length === 0 && initial.length > 0) {
        initial.forEach((el) => list.push(new LiveObject(el)));
      }
    },
    [],
  );

  // Seed Liveblocks Storage from Convex once per room session
  useEffect(() => {
    if (whiteboard?.content && !seededRef.current && liveElements !== null) {
      seededRef.current = true;
      try {
        const parsed = JSON.parse(whiteboard.content);
        if (parsed?.elements?.length > 0) {
          seedElements(parsed.elements);
        }
      } catch {
        // ignore parse error
      }
    }
  }, [whiteboard, liveElements, seedElements]);

  // ── Local state for drawing-in-progress ────────────────────────────────────
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(
    null,
  );
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  // Undo/Redo via Liveblocks built-in history
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const handleUndo = useCallback(() => {
    history.undo();
  }, [history]);

  const handleRedo = useCallback(() => {
    history.redo();
  }, [history]);

  // Clear all elements
  const handleClear = useLiveblocksM(({ storage }) => {
    const list = storage.get("elements");
    while (list.length > 0) list.delete(0);
  }, []);

  // ── Utilities & Canvas ─────────────────────────────────────────────────────
  const whiteboardAccess = useWhiteboardAccess(whiteboard);
  const canvasViewport = useCanvasViewport();

  const {
    generateId,
    getElementsAtPoint,
    getElementsInBounds,
    getResizeHandle,
    moveElements,
    resizeElement,
    getElementBounds,
    getElementsOnPath,
  } = useWhiteboardUtils(canvasViewport.zoom, elements);

  const whiteboardDrawing = useWhiteboardDrawing({
    currentTool,
    currentColor,
    strokeWidth,
    fillColor,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    getMousePosition: canvasViewport.getMousePosition,
    generateId,
    getElementsAtPoint,
    getElementsInBounds,
    getResizeHandle,
    deleteElements: (ids) => deleteElementsLive(ids),
    moveElements,
    resizeElement,
    updateElement: (el) => updateElement(el as unknown as DrawingElementJson),
    getElementBounds,
    getElementsOnPath,
    eraserSize,
    currentElement,
    setCurrentElement,
    selectedElements,
    setSelectedElements,
    elements,
    // When element is completed, write to Liveblocks as DrawingElementJson
    completeCurrentElement: () => {
      if (currentElement) {
        addElement(currentElement as unknown as DrawingElementJson);
        setCurrentElement(null);
      }
    },
    saveToHistory: () => {},
    startPanning: canvasViewport.startPanning,
    handlePan: canvasViewport.handlePan,
    stopPanning: canvasViewport.stopPanning,
  });

  const whiteboardAutoSave = useWhiteboardAutoSave({
    whiteboardId,
    elements,
    hasEditAccess: whiteboardAccess.hasEditAccess,
    isDrawing: whiteboardDrawing.isDrawing,
    currentElement,
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
    handleUndo,
    handleRedo,
    saveWhiteboard: whiteboardAutoSave.saveWhiteboard,
    selectAllElements: () => setSelectedElements(elements.map((el) => el.id)),
    deleteSelectedElements: useCallback(() => {
      if (selectedElements.length > 0) {
        deleteElementsLive(selectedElements);
        setSelectedElements([]);
      }
    }, [selectedElements, deleteElementsLive]),
    clearSelection: () => setSelectedElements([]),
    handleZoomIn: canvasViewport.handleZoomIn,
    handleZoomOut: canvasViewport.handleZoomOut,
    handleResetZoom: canvasViewport.handleResetZoom,
    toggleGrid: canvasViewport.toggleGrid,
    setShowCommandMenu,
  });

  // Load canvas viewport settings from Convex (zoom, pan, grid)
  useEffect(() => {
    if (whiteboard?.content) {
      try {
        const parsed = JSON.parse(whiteboard.content);
        if (parsed?.canvasSettings) {
          canvasViewport.loadViewportSettings(parsed.canvasSettings);
        }
      } catch {
        // ignore
      }
    }
  }, [whiteboard?.content]);

  // Broadcast local selection and drafts to Presence
  useEffect(() => {
    updateMyPresence({ selection: selectedElements });
  }, [selectedElements, updateMyPresence]);

  useEffect(() => {
    updateMyPresence({
      pencilDraft: currentElement as unknown as DrawingElementJson | null,
    });
  }, [currentElement, updateMyPresence]);

  const others = useOthers();
  const otherUsersDrafts = others
    .map((o) => o.presence.pencilDraft as unknown as DrawingElement)
    .filter(Boolean);

  const otherUsersSelections = others.reduce(
    (acc: Record<string, string>, o) => {
      if (o.presence.selection) {
        o.presence.selection.forEach((id: string) => {
          acc[id] = o.info?.pictureUrl || "blue"; // We could use color here
        });
      }
      return acc;
    },
    {},
  );

  // Initialize canvas engine — reads from Liveblocks-derived elements
  useCanvasEngine({
    canvasRef,
    elements,
    currentElement,
    otherUsersDrafts,
    otherUsersSelections,
    zoom: canvasViewport.zoom,
    panOffset: canvasViewport.panOffset,
    showGrid: canvasViewport.showGrid,
    canvasSize: canvasViewport.canvasSize,
    selectedElements,
    selectionBox: whiteboardDrawing.selectionBox,
    editingTextId: editingTextElement?.id || null,
    onElementSelect: (elementId: string) => {
      setSelectedElements((prev) =>
        prev.includes(elementId)
          ? prev.filter((id) => id !== elementId)
          : [elementId],
      );
    },
    getElementBounds: getElementBounds,
    cursorPosition: whiteboardDrawing.cursorPosition,
    eraserSize: eraserSize,
    currentTool: currentTool,
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

  // Text commits are handled inside CanvasTextBlock directly.

  return (
    <div className="relative w-screen h-screen bg-[#f8f9fa] overflow-hidden">
      {/* Floating Top Toolbar */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-[95%] sm:max-w-[90%]">
        <TopToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          zoom={canvasViewport.zoom}
          showGrid={canvasViewport.showGrid}
          whiteboardTitle={whiteboard?.title}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          onZoomIn={canvasViewport.handleZoomIn}
          onZoomOut={canvasViewport.handleZoomOut}
          onResetZoom={canvasViewport.handleResetZoom}
          onToggleGrid={canvasViewport.toggleGrid}
          onSave={whiteboardAutoSave.saveWhiteboard}
          onLoad={loadWhiteboard}
          onRename={(title) => {
            if (whiteboard?._id) {
              updateWhiteboard({ id: whiteboard._id, title });
              toast.success("Whiteboard renamed");
            }
          }}
          disabled={!whiteboardAccess.hasEditAccess}
        />
      </div>

      {/* Floating Properties Panel */}
      <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-40">
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
      </div>

      {/* Floating Sidebar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 rounded-full">
        <Sidebar
          currentTool={currentTool}
          onToolChange={setCurrentTool}
          disabled={!whiteboardAccess.hasEditAccess}
        />
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        className="absolute inset-0 z-0 touch-none"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          updateMyPresence({
            cursor: { x: e.clientX - rect.left, y: e.clientY - rect.top },
          });
        }}
        onPointerLeave={() => {
          updateMyPresence({ cursor: null });
        }}
      >
        {/* Render Other Users Cursors */}
        <Cursors />
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
        {selectedElements.length > 0 && (
          <div className="absolute bottom-24 left-4 bg-blue-100 border border-blue-300 rounded-lg p-2 z-40 max-w-[300px]">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-blue-800 flex-shrink-0">
                {selectedElements.length} element
                {selectedElements.length > 1 ? "s" : ""} selected
              </span>
              {whiteboardAccess.hasEditAccess && (
                <button
                  onClick={() => {
                    deleteElementsLive(selectedElements);
                    setSelectedElements([]);
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
          width={
            canvasViewport.canvasSize.width *
            (typeof window !== "undefined" ? window.devicePixelRatio : 1)
          }
          height={
            canvasViewport.canvasSize.height *
            (typeof window !== "undefined" ? window.devicePixelRatio : 1)
          }
          onMouseDown={(e) => {
            // Text tool: create a LOCAL draft element — do NOT push to Liveblocks yet
            if (currentTool === "text" && whiteboardAccess.hasEditAccess) {
              const pos = canvasViewport.getMousePosition(e);
              const draftEl: DrawingElement = {
                id: generateId(),
                type: "text",
                points: [pos],
                color: currentColorRef.current,
                strokeWidth: strokeWidthRef.current,
                text: "",
                fontSize: fontSizeRef.current,
                fontWeight: "400",
                fontStyle: "normal",
              };
              setEditingTextElement(draftEl);
              setIsNewTextElement(true);
              setCurrentTool("select");
              return;
            }
            // If we are currently editing a text element, skip this click for drawing.
            // The CanvasTextBlock component handles its own commit on click-outside.
            if (editingTextElement) {
              return;
            }
            whiteboardDrawing.startDrawing(e);
          }}
          onDoubleClick={(e) => {
            // Double click to edit existing text element
            if (!whiteboardAccess.hasEditAccess) return;
            const pos = canvasViewport.getMousePosition(e);
            const clickedElements = getElementsAtPoint(pos) || [];
            const textEl = clickedElements.find(
              (el: DrawingElement) => el.type === "text",
            );
            if (textEl) {
              setEditingTextElement(textEl);
              setCurrentTool("select");
            }
          }}
          onMouseMove={(e) => {
            whiteboardDrawing.draw(e);
          }}
          onMouseUp={whiteboardDrawing.stopDrawing}
          onMouseLeave={whiteboardDrawing.stopDrawing}
          onMouseEnter={(e) => {}}
          className="cursor-crosshair"
          style={{
            width: canvasViewport.canvasSize.width,
            height: canvasViewport.canvasSize.height,
            display: "block",
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

        <KeyboardShortcuts
          isOpen={showShortcuts}
          onClose={() => setShowShortcuts(false)}
        />

        <CommandMenu
          isOpen={showCommandMenu}
          onOpenChange={setShowCommandMenu}
          onToolChange={setCurrentTool}
          onAction={(action) => {
            if (
              !whiteboardAccess.hasEditAccess &&
              ["clear", "save"].includes(action)
            ) {
              toast.error("You don't have permission to perform this action");
              return;
            }

            switch (action) {
              case "undo":
                handleUndo();
                break;
              case "redo":
                handleRedo();
                break;
              case "zoom-in":
                canvasViewport.handleZoomIn();
                break;
              case "zoom-out":
                canvasViewport.handleZoomOut();
                break;
              case "zoom-reset":
                canvasViewport.handleResetZoom();
                break;
              case "toggle-grid":
                canvasViewport.toggleGrid();
                break;
              case "clear":
                if (
                  confirm("Are you sure you want to clear the entire canvas?")
                ) {
                  handleClear();
                  toast.success("Canvas cleared");
                }
                break;
              case "save":
                toast.success("Autosave is active. Changes are synced!");
                break;
              case "shortcuts":
                setShowShortcuts(true);
                break;
              case "export":
                const canvas = canvasRef.current;
                if (canvas) {
                  const dataUrl = canvas.toDataURL("image/png");
                  const link = document.createElement("a");
                  link.download = `whiteboard-${whiteboardId}.png`;
                  link.href = dataUrl;
                  link.click();
                  toast.success("Exported as PNG");
                }
                break;
            }
          }}
        />

        {editingTextElement && (
          <CanvasTextBlock
            element={editingTextElement}
            zoom={canvasViewport.zoom}
            panOffset={canvasViewport.panOffset}
            onChange={(text, format) => {
              if (isNewTextElement) {
                if (text.trim()) {
                  // Promote new element to storage on first non-empty input
                  addElement({
                    ...editingTextElement,
                    text: text, // Draft might have leading/trailing spaces while typing
                    fontSize: format.fontSize,
                    fontWeight: format.fontWeight,
                    fontStyle: format.fontStyle,
                  } as unknown as DrawingElementJson);
                  setIsNewTextElement(false);
                }
              } else {
                // Update existing element
                const base =
                  elements.find((e) => e.id === editingTextElement.id) ||
                  editingTextElement;
                updateElement({
                  ...base,
                  text: text,
                  fontSize: format.fontSize,
                  fontWeight: format.fontWeight,
                  fontStyle: format.fontStyle,
                } as unknown as DrawingElementJson);
              }
            }}
            onCommit={(
              text: string,
              format: {
                fontSize: number;
                fontWeight: string | number;
                fontStyle: string;
              },
            ) => {
              if (isNewTextElement) {
                // New element: only persist if non-empty
                if (text.trim()) {
                  addElement({
                    ...editingTextElement,
                    text: text.trim(),
                    fontSize: format.fontSize,
                    fontWeight: format.fontWeight,
                    fontStyle: format.fontStyle,
                  } as unknown as DrawingElementJson);
                }
                // Empty new element → just discard (never touched Liveblocks)
              } else {
                // Existing element: update or delete
                const base =
                  elements.find((e) => e.id === editingTextElement.id) ||
                  editingTextElement;
                if (text.trim()) {
                  updateElement({
                    ...base,
                    text: text.trim(),
                    fontSize: format.fontSize,
                    fontWeight: format.fontWeight,
                    fontStyle: format.fontStyle,
                  } as unknown as DrawingElementJson);
                } else {
                  deleteElementsLive([editingTextElement.id]);
                }
              }
              setEditingTextElement(null);
              setIsNewTextElement(false);
            }}
            onMove={(newPoint: { x: number; y: number }) => {
              const updated: DrawingElement = {
                ...editingTextElement,
                points: [newPoint, ...editingTextElement.points.slice(1)],
              };
              // If existing, persist position immediately
              if (!isNewTextElement) {
                updateElement(updated as unknown as DrawingElementJson);
              }
              setEditingTextElement(updated);
            }}
            disabled={!whiteboardAccess.hasEditAccess}
          />
        )}
      </div>
    </div>
  );
};

export default function WhiteboardCanvasRoom() {
  const params = useParams();
  const whiteboardId = params.id as string;

  return (
    <RoomProvider
      id={whiteboardId}
      initialPresence={{ cursor: null, selection: [], pencilDraft: null }}
      initialStorage={{ elements: new LiveList([]) }}
    >
      <ClientSideSuspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
              <p className="text-sm text-gray-500 font-medium">
                Connecting to room…
              </p>
            </div>
          </div>
        }
      >
        <WhiteboardCanvas />
      </ClientSideSuspense>
    </RoomProvider>
  );
}

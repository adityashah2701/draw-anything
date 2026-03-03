"use client";

import * as React from "react";

import useCanvasEngine from "@/features/whiteboard/components/canvas-drawing";
import KeyboardShortcuts from "@/features/whiteboard/components/keyboard-shortcuts";
import PropertiesPanel from "@/features/whiteboard/components/properties-panel";
import Sidebar from "@/features/whiteboard/components/sidebar";
import CanvasTextBlock from "@/features/whiteboard/components/canvas-text-block";
import TopToolbar from "@/features/whiteboard/components/top-toolbar";
import AIDiagramModal from "@/features/whiteboard/components/ai-diagram-modal";
import { CommandMenu } from "@/features/whiteboard/components/command-menu";
import {
  ArrowRoutingMode,
  ArrowType,
  DrawingElement,
  Tool,
} from "@/features/whiteboard/types/whiteboard.types";
import { getArrowHeadVisibility, isArrowElement } from "@/core/shapes/Arrow";
import { useArrowRouting } from "@/core/hooks/useArrowRouting";
import {
  insertBendPoint,
  removeBendPoint,
} from "@/core/routing/orthogonalRouter";
import { DrawingElementJson } from "@/liveblocks.config";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { LiveList, LiveObject } from "@liveblocks/client";
import { Eye, EyeOff } from "lucide-react";

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
  const [fontSize, setFontSize] = useState(20);
  const [eraserSize] = useState(20);

  // UI state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showOutlineColorPicker, setShowOutlineColorPicker] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [hideCanvasUi, setHideCanvasUi] = useState(false);
  const seededRef = useRef(false);
  const viewportLoadedRef = useRef(false);

  // Inline text editing state
  // isNewTextElement = true means the element has NOT yet been persisted to Liveblocks
  // We defer addElement until the user commits, so blur/click-away never creates garbage elements
  const [editingTextElement, setEditingTextElement] =
    useState<DrawingElement | null>(null);
  const [isNewTextElement, setIsNewTextElement] = useState(false);
  const [editingShapeLabelId, setEditingShapeLabelId] = useState<string | null>(
    null,
  );
  const [editingShapeLabelDraft, setEditingShapeLabelDraft] = useState("");
  const [editingShapeLabelFontSize, setEditingShapeLabelFontSize] =
    useState(20);
  const [editingShapeLabelFontWeight, setEditingShapeLabelFontWeight] =
    useState<string | number>("600");
  const [editingShapeLabelFontStyle, setEditingShapeLabelFontStyle] =
    useState("normal");
  const shapeLabelEditorRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!editingShapeLabelId || !shapeLabelEditorRef.current) return;
    const editor = shapeLabelEditorRef.current;
    editor.innerText = editingShapeLabelDraft;
    editor.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch {
      // ignore selection failures
    }
    // Intentionally only run when edit session starts; running on each draft
    // update would reset caret and cause reverse typing behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingShapeLabelId]);

  // Liveblocks presence
  const updateMyPresence = useUpdateMyPresence();

  // ── Liveblocks Storage ──────────────────────────────────────────────────────
  // Read elements from shared LiveList (real-time, all users)
  const liveElements = useStorage((root) => root.elements);
  // Derived plain array for canvas rendering
  const elements = React.useMemo(
    () =>
      (liveElements || [])
        .filter(Boolean)
        .map((el: DrawingElementJson) => el as unknown as DrawingElement),
    [liveElements],
  );

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

  const deleteElementsWithConnectedArrows = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const selected = new Set(ids);
      const toDelete = new Set(ids);

      elements.forEach((el) => {
        if (!isArrowElement(el)) return;
        const startId = el.startConnection?.elementId;
        const endId = el.endConnection?.elementId;
        if (
          (startId && selected.has(startId)) ||
          (endId && selected.has(endId))
        ) {
          toDelete.add(el.id);
        }
      });

      deleteElementsLive(Array.from(toDelete));
    },
    [elements, deleteElementsLive],
  );

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

  const handleFitToScreen = useCallback(() => {
    if (elements.length === 0) {
      canvasViewport.handleResetZoom();
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    elements.forEach((el) => {
      const bounds = getElementBounds(el);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      canvasViewport.handleResetZoom();
      return;
    }

    canvasViewport.fitToBounds({ minX, minY, maxX, maxY });
  }, [
    elements,
    getElementBounds,
    canvasViewport,
  ]);

  const { rerouteArrowsForChanges, routeArrow } = useArrowRouting({
    elements,
    getElementBounds,
  });

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
    deleteElements: (ids) => deleteElementsWithConnectedArrows(ids),
    moveElements: (ids, dx, dy) => {
      const moved = moveElements(ids, dx, dy);
      const arrows = rerouteArrowsForChanges(moved);
      arrows.forEach((a) => updateElement(a as unknown as DrawingElementJson));
      return moved;
    },
    resizeElement: (id, handle, pt, bounds) => {
      const resized = resizeElement(id, handle, pt, bounds);
      if (resized) {
        const arrows = rerouteArrowsForChanges([resized]);
        arrows.forEach((a) =>
          updateElement(a as unknown as DrawingElementJson),
        );
      }
      return resized;
    },
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
    // Directly add an arrow element created by connection drag
    addElementDirect: (el) => addElement(el as unknown as DrawingElementJson),
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

  // Reset one-time hydration guards when room changes.
  useEffect(() => {
    seededRef.current = false;
    viewportLoadedRef.current = false;
  }, [whiteboardId]);

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
        deleteElementsWithConnectedArrows(selectedElements);
        setSelectedElements([]);
      }
    }, [selectedElements, deleteElementsWithConnectedArrows]),
    clearSelection: () => setSelectedElements([]),
    handleZoomIn: canvasViewport.handleZoomIn,
    handleZoomOut: canvasViewport.handleZoomOut,
    handleResetZoom: canvasViewport.handleResetZoom,
    handleFitToScreen,
    toggleGrid: canvasViewport.toggleGrid,
    setShowCommandMenu,
  });

  // Load canvas viewport settings once from Convex (zoom, pan, grid)
  useEffect(() => {
    if (!whiteboard?.content || viewportLoadedRef.current) return;

    try {
      const parsed = JSON.parse(whiteboard.content);
      if (parsed?.canvasSettings) {
        canvasViewport.loadViewportSettings(parsed.canvasSettings);
      }
      viewportLoadedRef.current = true;
    } catch {
      // ignore
    }
  }, [whiteboard?.content, canvasViewport, canvasViewport.loadViewportSettings]);

  // Broadcast local selection and drafts to Presence
  useEffect(() => {
    updateMyPresence({ selection: selectedElements });
  }, [selectedElements, updateMyPresence]);

  useEffect(() => {
    updateMyPresence({
      pencilDraft: currentElement as unknown as DrawingElementJson | null,
    });
  }, [currentElement, updateMyPresence]);

  // Sync properties panel with selected element
  useEffect(() => {
    if (selectedElements.length === 1) {
      const selected = elements.find((el) => el.id === selectedElements[0]);
      if (selected) {
        if (selected.color && selected.color !== currentColor)
          setCurrentColor(selected.color);
        if (selected.strokeWidth && selected.strokeWidth !== strokeWidth)
          setStrokeWidth(selected.strokeWidth);
        const fillValue = selected.fill || "#transparent";
        if (fillValue !== fillColor) setFillColor(fillValue);
        if (selected.fontSize && selected.fontSize !== fontSize)
          setFontSize(selected.fontSize);
      }
    }
  }, [
    selectedElements,
    elements,
    currentColor,
    strokeWidth,
    fillColor,
    fontSize,
  ]);

  const selectedElement = React.useMemo(
    () =>
      selectedElements.length === 1
        ? elements.find((element) => element.id === selectedElements[0]) ?? null
        : null,
    [elements, selectedElements],
  );

  const selectedArrow = React.useMemo(() => {
    if (!selectedElement || !isArrowElement(selectedElement)) {
      return null;
    }
    const heads = getArrowHeadVisibility(selectedElement);
    return {
      type: selectedElement.type,
      routingMode: selectedElement.routingMode ?? "orthogonal",
      dashed: Boolean(selectedElement.dashed),
      arrowHeadStart: heads.start,
      arrowHeadEnd: heads.end,
    };
  }, [selectedElement]);

  const updateSelectedArrow = useCallback(
    (
      patch: Partial<
        Pick<
          DrawingElement,
          | "type"
          | "routingMode"
          | "dashed"
          | "arrowHeadStart"
          | "arrowHeadEnd"
          | "isManuallyRouted"
        >
      >,
    ) => {
      if (!whiteboardAccess.hasEditAccess) return;
      if (!selectedElement || !isArrowElement(selectedElement)) return;

      let next: DrawingElement = {
        ...selectedElement,
        ...patch,
      };

      if (patch.type === "arrow-bidirectional") {
        next.arrowHeadStart = patch.arrowHeadStart ?? true;
        next.arrowHeadEnd = patch.arrowHeadEnd ?? true;
      }

      if (patch.type === "arrow") {
        next.arrowHeadStart = patch.arrowHeadStart ?? false;
        next.arrowHeadEnd = patch.arrowHeadEnd ?? true;
      }

      if (patch.routingMode === "straight") {
        const endIndex = Math.max(1, next.points.length - 1);
        next.points = [next.points[0], next.points[endIndex]];
        next.isManuallyRouted = false;
      } else if (
        patch.routingMode === "orthogonal" &&
        isArrowElement(next)
      ) {
        next = routeArrow(next, {
          routingMode: "orthogonal",
          preserveManualBends: Boolean(next.isManuallyRouted),
        });
      }

      updateElement(next as unknown as DrawingElementJson);
    },
    [routeArrow, selectedElement, updateElement, whiteboardAccess.hasEditAccess],
  );

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
    getElementBounds,
    cursorPosition: whiteboardDrawing.cursorPosition,
    eraserSize: eraserSize,
    currentTool: currentTool,
    hoveredElementId: whiteboardDrawing.hoveredElementId,
    connectionDraft: whiteboardDrawing.connectionDraft,
    editingShapeLabelId,
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

    if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
      selectedElements.forEach((id) => {
        const el = elements.find((e) => e.id === id);
        if (el) {
          updateElement({ ...el, color } as unknown as DrawingElementJson);
        }
      });
    }
  };

  const handleFillColorChange = (color: string) => {
    setFillColor(color);
    setShowFillColorPicker(false);

    if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
      selectedElements.forEach((id) => {
        const el = elements.find((e) => e.id === id);
        if (el) {
          updateElement({
            ...el,
            fill: color,
          } as unknown as DrawingElementJson);
        }
      });
    }
  };

  const handleStrokeWidthChange = (width: number) => {
    setStrokeWidth(width);
    if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
      selectedElements.forEach((id) => {
        const el = elements.find((e) => e.id === id);
        if (el) {
          updateElement({
            ...el,
            strokeWidth: width,
          } as unknown as DrawingElementJson);
        }
      });
    }
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    if (selectedElements.length > 0 && whiteboardAccess.hasEditAccess) {
      selectedElements.forEach((id) => {
        const el = elements.find((e) => e.id === id);
        if (el) {
          updateElement({
            ...el,
            fontSize: size,
          } as unknown as DrawingElementJson);
        }
      });
    }
  };

  const handleArrowTypeChange = (type: ArrowType) => {
    updateSelectedArrow({ type });
  };

  const handleArrowRoutingModeChange = (mode: ArrowRoutingMode) => {
    updateSelectedArrow({ routingMode: mode });
  };

  const handleArrowDashedChange = (value: boolean) => {
    updateSelectedArrow({ dashed: value });
  };

  const handleArrowHeadStartChange = (value: boolean) => {
    updateSelectedArrow({ arrowHeadStart: value });
  };

  const handleArrowHeadEndChange = (value: boolean) => {
    updateSelectedArrow({ arrowHeadEnd: value });
  };

  const handleToggleOutlineColorPicker = () => {
    setShowFillColorPicker(false);
    setShowOutlineColorPicker(!showOutlineColorPicker);
  };

  const handleToggleFillColorPicker = () => {
    setShowOutlineColorPicker(false);
    setShowFillColorPicker(!showFillColorPicker);
  };

  const updateArrowBendsAtPoint = useCallback(
    (arrow: DrawingElement, point: { x: number; y: number }) => {
      if (!whiteboardAccess.hasEditAccess || !isArrowElement(arrow)) {
        return false;
      }

      const removeThreshold = 10 / canvasViewport.zoom;
      const insertThreshold = 12 / canvasViewport.zoom;

      for (let i = 1; i < arrow.points.length - 1; i += 1) {
        const bend = arrow.points[i];
        const distance = Math.hypot(point.x - bend.x, point.y - bend.y);
        if (distance <= removeThreshold) {
          const points = removeBendPoint(arrow.points, i);
          updateElement({
            ...arrow,
            points,
            routingMode: "orthogonal",
            isManuallyRouted: true,
          } as unknown as DrawingElementJson);
          return true;
        }
      }

      let closestSegment = -1;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < arrow.points.length - 1; i += 1) {
        const from = arrow.points[i];
        const to = arrow.points[i + 1];
        const distance =
          from.x === to.x
            ? Math.abs(point.x - from.x) +
              (point.y < Math.min(from.y, to.y) ||
              point.y > Math.max(from.y, to.y)
                ? Math.min(
                    Math.abs(point.y - from.y),
                    Math.abs(point.y - to.y),
                  )
                : 0)
            : Math.abs(point.y - from.y) +
              (point.x < Math.min(from.x, to.x) ||
              point.x > Math.max(from.x, to.x)
                ? Math.min(
                    Math.abs(point.x - from.x),
                    Math.abs(point.x - to.x),
                  )
                : 0);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestSegment = i;
        }
      }

      if (closestSegment >= 0 && closestDistance <= insertThreshold) {
        const points = insertBendPoint(arrow.points, closestSegment);
        updateElement({
          ...arrow,
          points,
          routingMode: "orthogonal",
          isManuallyRouted: true,
        } as unknown as DrawingElementJson);
        return true;
      }

      return false;
    },
    [canvasViewport.zoom, updateElement, whiteboardAccess.hasEditAccess],
  );

  // Text commits are handled inside CanvasTextBlock directly.

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,#f7f8fa_0%,#f2f4f7_45%,#eceff3_100%)]">
      <div
        className={`absolute right-4 z-[70] transition-all ${
          hideCanvasUi ? "top-4" : "top-24"
        }`}
      >
        <button
          onClick={() => setHideCanvasUi((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-white"
          title={hideCanvasUi ? "Show toolbars" : "Hide toolbars"}
        >
          {hideCanvasUi ? <Eye size={14} /> : <EyeOff size={14} />}
          {hideCanvasUi ? "Show UI" : "Hide UI"}
        </button>
      </div>

      {/* Floating Top Toolbar */}
      {!hideCanvasUi && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-50 w-[min(1440px,calc(100%-2rem))] -translate-x-1/2 px-1">
          <div className="pointer-events-auto">
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
              onFitToScreen={handleFitToScreen}
              onToggleGrid={canvasViewport.toggleGrid}
              onSave={whiteboardAutoSave.saveWhiteboard}
              onLoad={loadWhiteboard}
              onRename={(title) => {
                if (whiteboard?._id) {
                  updateWhiteboard({ id: whiteboard._id, title });
                  toast.success("Whiteboard renamed");
                }
              }}
              onGenerateDiagram={() => setShowAIModal(true)}
              disabled={!whiteboardAccess.hasEditAccess}
            />
          </div>
        </div>
      )}

      {/* Floating Properties Panel */}
      {!hideCanvasUi && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-40 w-[min(1280px,calc(100%-1rem))] -translate-x-1/2 px-1">
          <div className="pointer-events-auto">
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
              onStrokeWidthChange={handleStrokeWidthChange}
              onFontSizeChange={handleFontSizeChange}
              selectedArrow={selectedArrow}
              onArrowTypeChange={handleArrowTypeChange}
              onArrowRoutingModeChange={handleArrowRoutingModeChange}
              onArrowDashedChange={handleArrowDashedChange}
              onArrowHeadStartChange={handleArrowHeadStartChange}
              onArrowHeadEndChange={handleArrowHeadEndChange}
              disabled={!whiteboardAccess.hasEditAccess}
              isSaving={whiteboardAutoSave.isSaving}
              lastSaved={whiteboardAutoSave.lastSaved}
            />
          </div>
        </div>
      )}

      {/* Floating Sidebar */}
      {!hideCanvasUi && (
        <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full">
          <Sidebar
            currentTool={currentTool}
            onToolChange={setCurrentTool}
            disabled={!whiteboardAccess.hasEditAccess}
          />
        </div>
      )}

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
          <div className="absolute left-1/2 top-20 z-20 max-w-[90vw] -translate-x-1/2 rounded-lg border border-yellow-300 bg-yellow-100 p-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0"></div>
              <span className="text-sm text-yellow-800 truncate">
                Read-only mode - You don&apos;t have edit access to this
                whiteboard
              </span>
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
            if (editingShapeLabelId) {
              return;
            }
            // Text tool: create a LOCAL draft element — do NOT push to Liveblocks yet
            if (currentTool === "text" && whiteboardAccess.hasEditAccess) {
              const pos = canvasViewport.getMousePosition(e);
              const draftEl: DrawingElement = {
                id: generateId(),
                type: "text",
                points: [pos],
                color: currentColorRef.current,
                strokeWidth: strokeWidthRef.current,
                text: "TEXT",
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
            const topEl = [...clickedElements].reverse()[0];
            if (!topEl) return;

            if (topEl.type === "text") {
              setEditingTextElement(topEl);
              setCurrentTool("select");
              return;
            }

            if (isArrowElement(topEl)) {
              const handled = updateArrowBendsAtPoint(topEl, pos);
              if (handled) {
                return;
              }
            }

            if (
              topEl.type === "rectangle" ||
              topEl.type === "circle" ||
              topEl.type === "diamond"
            ) {
              setEditingShapeLabelId(topEl.id);
              setEditingShapeLabelDraft(topEl.label?.trim() || "TEXT");
              setEditingShapeLabelFontSize(topEl.fontSize || 20);
              setEditingShapeLabelFontWeight(topEl.fontWeight || "600");
              setEditingShapeLabelFontStyle(topEl.fontStyle || "normal");
              setSelectedElements([topEl.id]);
              setCurrentTool("select");
            }
          }}
          onMouseMove={(e) => {
            whiteboardDrawing.draw(e);
          }}
          onWheel={canvasViewport.handleWheelZoom}
          onMouseUp={whiteboardDrawing.stopDrawing}
          onMouseLeave={whiteboardDrawing.stopDrawing}
          onMouseEnter={() => {}}
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

        {/* AI Diagram Modal */}
        <AIDiagramModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          disabled={!whiteboardAccess.hasEditAccess}
          onGenerate={(newElements) => {
            // Place new AI graph near current viewport origin, then auto-fit to center it.
            const viewWorldMinX =
              -canvasViewport.panOffset.x / canvasViewport.zoom;
            const viewWorldMinY =
              -canvasViewport.panOffset.y / canvasViewport.zoom;

            const allX = newElements.flatMap((el) => el.points.map((p) => p.x));
            const allY = newElements.flatMap((el) => el.points.map((p) => p.y));
            const minX = Math.min(...allX);
            const minY = Math.min(...allY);
            const maxX = Math.max(...allX);
            const maxY = Math.max(...allY);

            const shiftX = viewWorldMinX + 80 - minX;
            const shiftY = viewWorldMinY + 80 - minY;

            newElements.forEach((el) => {
              const shifted = {
                ...el,
                points: el.points.map((p) => ({
                  x: p.x + shiftX,
                  y: p.y + shiftY,
                })),
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              addElement(shifted as any);
            });
            toast.success(
              `✨ AI added ${newElements.length} elements to the canvas!`,
            );

            // Auto fit and center the generated diagram immediately.
            const shiftedBounds = {
              minX: minX + shiftX,
              minY: minY + shiftY,
              maxX: maxX + shiftX,
              maxY: maxY + shiftY,
            };
            setTimeout(() => {
              canvasViewport.fitToBounds(shiftedBounds);
            }, 0);
          }}
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
              case "fit-screen":
                handleFitToScreen();
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
            selectAllOnMount={isNewTextElement}
            onChange={(text, format) => {
              // Keep typing local to make text editing feel canvas-native.
              // Persist only on commit to avoid per-keystroke storage churn.
              setEditingTextElement((prev) =>
                prev
                  ? {
                      ...prev,
                      text,
                      fontSize: format.fontSize,
                      fontWeight: format.fontWeight,
                      fontStyle: format.fontStyle,
                    }
                  : prev,
              );
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

        {editingShapeLabelId &&
          (() => {
            const shape = elements.find((el) => el.id === editingShapeLabelId);
            if (!shape) return null;
            const bounds = getElementBounds(shape);
            if (!bounds) return null;

            const cx = (bounds.minX + bounds.maxX) / 2;
            const cy = (bounds.minY + bounds.maxY) / 2;
            const sx = cx * canvasViewport.zoom + canvasViewport.panOffset.x;
            const sy = cy * canvasViewport.zoom + canvasViewport.panOffset.y;
            const inputWidth = Math.max(
              120,
              Math.min(
                260,
                (bounds.maxX - bounds.minX) * canvasViewport.zoom * 0.9,
              ),
            );
            const editorFontSize = Math.max(
              9,
              editingShapeLabelFontSize * canvasViewport.zoom,
            );
            const editorLineHeight = editorFontSize * 1.2;
            const lineCount = Math.max(
              1,
              (editingShapeLabelDraft || "TEXT").split("\n").length,
            );
            const editorBlockHeight = editorLineHeight * lineCount;

            return (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: sx,
                    top: sy - 36,
                    transform: "translate(-50%, -50%)",
                    zIndex: 111,
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white/90 px-1 py-1 shadow-sm backdrop-blur"
                >
                  <button
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() =>
                      setEditingShapeLabelFontWeight((prev) =>
                        prev === "700" ? "500" : "700",
                      )
                    }
                    className={`h-7 w-7 rounded text-xs font-bold ${
                      editingShapeLabelFontWeight === "700"
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-200"
                    }`}
                    title="Bold"
                  >
                    B
                  </button>
                  <button
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() =>
                      setEditingShapeLabelFontStyle((prev) =>
                        prev === "italic" ? "normal" : "italic",
                      )
                    }
                    className={`h-7 w-7 rounded text-xs italic ${
                      editingShapeLabelFontStyle === "italic"
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-200"
                    }`}
                    title="Italic"
                  >
                    I
                  </button>
                  <button
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() =>
                      setEditingShapeLabelFontSize((s) => Math.max(12, s - 2))
                    }
                    className="h-7 w-7 rounded text-slate-700 hover:bg-slate-200"
                    title="Decrease size"
                  >
                    -
                  </button>
                  <span className="w-10 text-center text-xs font-medium text-slate-600">
                    {editingShapeLabelFontSize}
                  </span>
                  <button
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() =>
                      setEditingShapeLabelFontSize((s) => Math.min(96, s + 2))
                    }
                    className="h-7 w-7 rounded text-slate-700 hover:bg-slate-200"
                    title="Increase size"
                  >
                    +
                  </button>
                </div>
                <div
                  ref={shapeLabelEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onInput={(ev) => {
                    const next = (ev.currentTarget as HTMLDivElement).innerText;
                    setEditingShapeLabelDraft(next);
                  }}
                  onKeyDown={(ev) => {
                    const mod = ev.metaKey || ev.ctrlKey;
                    if (mod && ev.key.toLowerCase() === "b") {
                      ev.preventDefault();
                      setEditingShapeLabelFontWeight((prev) =>
                        prev === "700" ? "500" : "700",
                      );
                      return;
                    }
                    if (mod && ev.key.toLowerCase() === "i") {
                      ev.preventDefault();
                      setEditingShapeLabelFontStyle((prev) =>
                        prev === "italic" ? "normal" : "italic",
                      );
                      return;
                    }
                    if (mod && (ev.key === "+" || ev.key === "=")) {
                      ev.preventDefault();
                      setEditingShapeLabelFontSize((s) => Math.min(96, s + 2));
                      return;
                    }
                    if (mod && ev.key === "-") {
                      ev.preventDefault();
                      setEditingShapeLabelFontSize((s) => Math.max(12, s - 2));
                      return;
                    }
                    if (ev.key === "Escape") {
                      setEditingShapeLabelId(null);
                      setEditingShapeLabelDraft("");
                      return;
                    }
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      const nextLabel =
                        (
                          shapeLabelEditorRef.current?.innerText ||
                          editingShapeLabelDraft
                        ).trim() || "TEXT";
                      updateElement({
                        ...shape,
                        label: nextLabel,
                        fontSize: editingShapeLabelFontSize,
                        fontWeight: editingShapeLabelFontWeight,
                        fontStyle: editingShapeLabelFontStyle,
                      } as unknown as DrawingElementJson);
                      setEditingShapeLabelId(null);
                      setEditingShapeLabelDraft("");
                    }
                  }}
                  onBlur={() => {
                    const nextLabel =
                      (
                        shapeLabelEditorRef.current?.innerText ||
                        editingShapeLabelDraft
                      ).trim() || "TEXT";
                    updateElement({
                      ...shape,
                      label: nextLabel,
                      fontSize: editingShapeLabelFontSize,
                      fontWeight: editingShapeLabelFontWeight,
                      fontStyle: editingShapeLabelFontStyle,
                    } as unknown as DrawingElementJson);
                    setEditingShapeLabelId(null);
                    setEditingShapeLabelDraft("");
                  }}
                  style={{
                    position: "absolute",
                    left: sx,
                    // Match canvas render math (top baseline + centered block)
                    // to remove edit-mode vertical jump.
                    top: sy - editorBlockHeight / 2,
                    transform: "translateX(-50%)",
                    width: inputWidth,
                    zIndex: 110,
                    textAlign: "center",
                    fontSize: editorFontSize,
                    fontWeight: editingShapeLabelFontWeight,
                    fontStyle: editingShapeLabelFontStyle as
                      | "normal"
                      | "italic",
                    lineHeight: `${editorLineHeight}px`,
                    letterSpacing: 0,
                    padding: 0,
                    minHeight: `${editorLineHeight}px`,
                    margin: 0,
                    direction: "ltr",
                    unicodeBidi: "plaintext",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily:
                      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  }}
                  className="bg-transparent text-slate-800 outline-none"
                />
              </>
            );
          })()}
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

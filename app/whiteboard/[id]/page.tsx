"use client";

import useCanvasEngine from "@/components/custom/whiteboard/canvas-drawing";
import KeyboardShortcuts from "@/components/custom/whiteboard/keyboard-shprtcuts";
import PropertiesPanel from "@/components/custom/whiteboard/properties-panel";
import Sidebar from "@/components/custom/whiteboard/sidebar";
import TextInputModal from "@/components/custom/whiteboard/text-input-modal";
import TopToolbar from "@/components/custom/whiteboard/top-toolbar";
import {
  CanvasState,
  DrawingElement,
  Point,
  Tool,
  WhiteboardData,
} from "@/types/whiteboard.types";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";

// Main Whiteboard Component
const WhiteboardCanvas: React.FC = () => {
  // Get the whiteboard ID from URL params
  const params = useParams();
  const whiteboardId = params.id as string;

  // Get current organization from Clerk
  const { organization } = useOrganization();

  // Convex hooks
  const updateWhiteboard = useMutation(api.whiteboard.update);
  const whiteboard = useQuery(
    api.whiteboard.getById,
    whiteboardId ? { id: whiteboardId as Id<"whiteboards"> } : "skip"
  );

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>("pen");
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState("#transparent");
  const [fontSize, setFontSize] = useState(16);

  // Canvas elements and history
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [history, setHistory] = useState<CanvasState[]>([
    { elements: [], currentElementId: null },
  ]);
  const [historyStep, setHistoryStep] = useState(0);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(
    null
  );
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [eraserSize, setEraserSize] = useState(20);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  // Canvas settings
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState<Point | null>(null);
  const [showGrid, setShowGrid] = useState(true);

  // UI state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasEditAccess, setHasEditAccess] = useState(true);

  // Add ref to track if we should auto-save
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastElementsCountRef = useRef(0);
  const [showOutlineColorPicker, setShowOutlineColorPicker] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);

  // Check if user has edit access to this whiteboard
  useEffect(() => {
    if (whiteboard && organization) {
      const hasAccess = whiteboard.orgId === organization.id;
      setHasEditAccess(hasAccess);

      if (!hasAccess) {
        console.warn("You don't have edit access to this whiteboard");
      }
    }
  }, [whiteboard, organization]);

  // Load whiteboard content when data is fetched
  useEffect(() => {
    if (whiteboard?.content) {
      try {
        const whiteboardData: WhiteboardData = JSON.parse(whiteboard.content);
        setElements(whiteboardData.elements || []);
        lastElementsCountRef.current = whiteboardData.elements?.length || 0;

        // Restore canvas settings if available
        if (whiteboardData.canvasSettings) {
          setZoom(whiteboardData.canvasSettings.zoom || 1);
          setPanOffset(
            whiteboardData.canvasSettings.panOffset || { x: 0, y: 0 }
          );
          setShowGrid(whiteboardData.canvasSettings.showGrid ?? true);
        }

        // Reset history with loaded content
        setHistory([
          { elements: whiteboardData.elements || [], currentElementId: null },
        ]);
        setHistoryStep(0);
      } catch (error) {
        console.error("Failed to parse whiteboard content:", error);
      }
    }
  }, [whiteboard]);

  useEffect(() => {
    setCanvasSize({ width: window.innerWidth, height: window.innerHeight });

    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // FIXED: Better auto-save logic that doesn't interfere with drawing
  useEffect(() => {
    if (!whiteboardId || !hasEditAccess || isDrawing || currentElement) {
      return; // Don't auto-save while drawing or if no edit access
    }

    // Only auto-save if the elements count has actually changed
    if (elements.length === lastElementsCountRef.current) {
      return;
    }

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveToConvex();
      lastElementsCountRef.current = elements.length;
    }, 10); // Increased to 3 seconds to reduce conflicts

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [elements, whiteboardId, hasEditAccess, isDrawing, currentElement]);

  const getElementBounds = useCallback((element: DrawingElement) => {
    if (element.points.length === 0) return null;

    let minX = element.points[0].x;
    let minY = element.points[0].y;
    let maxX = element.points[0].x;
    let maxY = element.points[0].y;

    if (element.type === "circle" && element.points.length === 2) {
      const centerX = element.points[0].x;
      const centerY = element.points[0].y;
      const edgeX = element.points[1].x;
      const edgeY = element.points[1].y;

      const radius = Math.sqrt(
        Math.pow(edgeX - centerX, 2) + Math.pow(edgeY - centerY, 2)
      );

      minX = centerX - radius;
      minY = centerY - radius;
      maxX = centerX + radius;
      maxY = centerY + radius;
    } else if (element.type === "text" && element.text && element.fontSize) {
      const textX = element.points[0].x;
      const textY = element.points[0].y;
      const textWidth = element.text.length * element.fontSize * 0.6;
      const textHeight = element.fontSize;

      minX = textX;
      minY = textY - textHeight;
      maxX = textX + textWidth;
      maxY = textY;
    } else {
      element.points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, []);

  // FIXED: Save to Convex with better error handling and state management
  const saveToConvex = useCallback(async () => {
    if (!whiteboardId || isSaving || !hasEditAccess) return;

    setIsSaving(true);
    try {
      const whiteboardData: WhiteboardData = {
        elements,
        canvasSettings: {
          zoom,
          panOffset,
          showGrid,
        },
        metadata: {
          version: "1.0.0",
          createdAt: whiteboard?._creationTime || new Date().toISOString(),
          lastModified: new Date().toISOString(),
        },
      };

      await updateWhiteboard({
        id: whiteboardId as Id<"whiteboards">,
        content: JSON.stringify(whiteboardData),
      });

      setLastSaved(new Date());
      lastElementsCountRef.current = elements.length; // Update the ref after successful save
      console.log("Whiteboard saved successfully!");
    } catch (error: any) {
      console.error("Failed to save whiteboard:", error);

      if (error.message?.includes("Unauthorized")) {
        setHasEditAccess(false);
        toast(
          "You don't have permission to edit this whiteboard. It may belong to a different organization."
        );
      } else {
        toast.error("Failed to save whiteboard. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    whiteboardId,
    elements,
    zoom,
    panOffset,
    showGrid,
    updateWhiteboard,
    isSaving,
    whiteboard,
    hasEditAccess,
  ]);

  // Manual save function
  const saveWhiteboard = useCallback(async () => {
    if (!hasEditAccess) {
      toast("You don't have permission to save this whiteboard.");
      return;
    }

    // Cancel auto-save timeout when manually saving
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    await saveToConvex();
    toast.success("Whiteboard saved successfully!");
  }, [saveToConvex, hasEditAccess]);

  // Initialize canvas engine
  useCanvasEngine({
    canvasRef,
    elements,
    currentElement,
    zoom,
    panOffset,
    showGrid,
    canvasSize,
    selectedElements,
    onElementSelect: (elementId: string) => {
      setSelectedElements((prev) =>
        prev.includes(elementId)
          ? prev.filter((id) => id !== elementId)
          : [...prev, elementId]
      );
    },
    getElementBounds,
  });

  // Utility functions for element detection
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const isPointInElement = useCallback(
    (point: Point, element: DrawingElement): boolean => {
      const tolerance = 10;

      switch (element.type) {
        case "freehand":
          return element.points.some(
            (p) =>
              Math.abs(p.x - point.x) < tolerance &&
              Math.abs(p.y - point.y) < tolerance
          );

        case "rectangle":
          if (element.points.length === 2) {
            const [start, end] = element.points;
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            return (
              point.x >= minX &&
              point.x <= maxX &&
              point.y >= minY &&
              point.y <= maxY
            );
          }
          break;

        case "circle":
          if (element.points.length === 2) {
            const [center, edge] = element.points;
            const radius = Math.sqrt(
              Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
            );
            const distance = Math.sqrt(
              Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
            );
            return distance <= radius;
          }
          break;

        case "line":
        case "arrow":
          if (element.points.length === 2) {
            const [start, end] = element.points;
            const lineLength = Math.sqrt(
              Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
            );
            const distanceToStart = Math.sqrt(
              Math.pow(point.x - start.x, 2) + Math.pow(point.y - start.y, 2)
            );
            const distanceToEnd = Math.sqrt(
              Math.pow(point.x - end.x, 2) + Math.pow(point.y - end.y, 2)
            );
            return (
              Math.abs(distanceToStart + distanceToEnd - lineLength) < tolerance
            );
          }
          break;

        case "text":
          if (element.text && element.fontSize) {
            const textWidth = element.text.length * element.fontSize * 0.6;
            const textHeight = element.fontSize;
            const [textPos] = element.points;
            return (
              point.x >= textPos.x &&
              point.x <= textPos.x + textWidth &&
              point.y >= textPos.y - textHeight &&
              point.y <= textPos.y
            );
          }
          break;
      }
      return false;
    },
    []
  );

  const getElementsAtPoint = useCallback(
    (point: Point): DrawingElement[] => {
      return elements.filter((element) => isPointInElement(point, element));
    },
    [elements, isPointInElement]
  );

  const deleteElements = useCallback(
    (elementIds: string[]) => {
      if (!hasEditAccess) {
        toast(
          "You don't have permission to delete elements from this whiteboard."
        );
        return;
      }

      setElements((prev) =>
        prev.filter((element) => !elementIds.includes(element.id))
      );
      setSelectedElements([]);
      saveToHistory();
    },
    [hasEditAccess]
  );

  const deleteSelectedElements = useCallback(() => {
    if (selectedElements.length > 0) {
      deleteElements(selectedElements);
    }
  }, [selectedElements, deleteElements]);

  // Check if point is on resize handle
  const getResizeHandle = useCallback(
    (point: Point, element: DrawingElement): string | null => {
      const bounds = getElementBounds(element);
      if (!bounds) return null;

      const handleSize = 8 / zoom;
      const { minX, minY, maxX, maxY } = bounds;

      const handles = [
        { name: "nw", x: minX, y: minY },
        { name: "n", x: (minX + maxX) / 2, y: minY },
        { name: "ne", x: maxX, y: minY },
        { name: "e", x: maxX, y: (minY + maxY) / 2 },
        { name: "se", x: maxX, y: maxY },
        { name: "s", x: (minX + maxX) / 2, y: maxY },
        { name: "sw", x: minX, y: maxY },
        { name: "w", x: minX, y: (minY + maxY) / 2 },
      ];

      for (const handle of handles) {
        if (
          Math.abs(point.x - handle.x) <= handleSize &&
          Math.abs(point.y - handle.y) <= handleSize
        ) {
          return handle.name;
        }
      }

      return null;
    },
    [getElementBounds, zoom]
  );

  // Move selected elements
  const moveElements = useCallback(
    (elementIds: string[], deltaX: number, deltaY: number) => {
      if (!hasEditAccess) return;

      setElements((prev) =>
        prev.map((element) => {
          if (elementIds.includes(element.id)) {
            return {
              ...element,
              points: element.points.map((point) => ({
                x: point.x + deltaX,
                y: point.y + deltaY,
              })),
            };
          }
          return element;
        })
      );
    },
    [hasEditAccess]
  );

  // Resize element
  const resizeElement = useCallback(
    (elementId: string, handle: string, point: Point, originalBounds: any) => {
      if (!hasEditAccess) return;

      setElements((prev) =>
        prev.map((element) => {
          if (element.id !== elementId) return element;

          const bounds = originalBounds;
          let newPoints = [...element.points];

          if (element.type === "rectangle" || element.type === "circle") {
            if (element.points.length === 2) {
              let [start, end] = element.points;

              switch (handle) {
                case "nw":
                  start = { x: point.x, y: point.y };
                  break;
                case "ne":
                  start = { x: start.x, y: point.y };
                  end = { x: point.x, y: end.y };
                  break;
                case "se":
                  end = { x: point.x, y: point.y };
                  break;
                case "sw":
                  start = { x: point.x, y: start.y };
                  end = { x: end.x, y: point.y };
                  break;
                case "n":
                  start = { x: start.x, y: point.y };
                  break;
                case "s":
                  end = { x: end.x, y: point.y };
                  break;
                case "e":
                  end = { x: point.x, y: end.y };
                  break;
                case "w":
                  start = { x: point.x, y: start.y };
                  break;
              }

              newPoints = [start, end];
            }
          } else if (element.type === "line" || element.type === "arrow") {
            if (element.points.length === 2) {
              if (handle.includes("s")) {
                newPoints[0] = point;
              } else {
                newPoints[1] = point;
              }
            }
          }

          return { ...element, points: newPoints };
        })
      );
    },
    [hasEditAccess]
  );

  // Get mouse position relative to canvas
  const getMousePosition = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - panOffset.x) / zoom,
        y: (e.clientY - rect.top - panOffset.y) / zoom,
      };
    },
    [zoom, panOffset]
  );

  // Save state to history
  const saveToHistory = useCallback(() => {
    if (!hasEditAccess) return;

    const newHistory = history.slice(0, historyStep + 1);
    const newState: CanvasState = {
      elements: [...elements],
      currentElementId: null,
    };
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [elements, history, historyStep, hasEditAccess]);

  // Load whiteboard data (simulated)
  const loadWhiteboard = useCallback(() => {
    console.log("=== LOAD WHITEBOARD ===");
    console.log("This whiteboard is automatically loaded from the database.");
    console.log("Current whiteboard ID:", whiteboardId);
    console.log("=== END LOAD INFO ===");

    toast.success("This whiteboard is automatically loaded from the database!");
  }, [whiteboardId]);

  // Action handlers
  const handleUndo = useCallback(() => {
    if (!hasEditAccess) {
      toast.error("You don't have permission to modify this whiteboard.");
      return;
    }

    if (historyStep > 0) {
      const previousState = history[historyStep - 1];
      setHistoryStep(historyStep - 1);
      setElements(previousState.elements);
    }
  }, [historyStep, history, hasEditAccess]);

  const handleRedo = useCallback(() => {
    if (!hasEditAccess) {
      toast.error("You don't have permission to modify this whiteboard.");
      return;
    }

    if (historyStep < history.length - 1) {
      const nextState = history[historyStep + 1];
      setHistoryStep(historyStep + 1);
      setElements(nextState.elements);
    }
  }, [historyStep, history, hasEditAccess]);

  const handleClear = useCallback(() => {
    if (!hasEditAccess) {
      toast.error("You don't have permission to clear this whiteboard.");
      return;
    }

    setElements([]);
    saveToHistory();
  }, [saveToHistory, hasEditAccess]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

 const handleColorChange = (color: string) => {
  setCurrentColor(color);
  setShowOutlineColorPicker(false);
};

// Add new handler for fill color:
const handleFillColorChange = (color: string) => {
  setFillColor(color);
  setShowFillColorPicker(false);
};

// Add handlers for toggling color pickers:
const handleToggleOutlineColorPicker = () => {
  setShowFillColorPicker(false); // Close other picker
  setShowOutlineColorPicker(!showOutlineColorPicker);
};

const handleToggleFillColorPicker = () => {
  setShowOutlineColorPicker(false); // Close other picker
  setShowFillColorPicker(!showFillColorPicker);
};

  // Drawing event handlers - with edit access checks
  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (
        !hasEditAccess &&
        currentTool !== "hand" &&
        currentTool !== "select"
      ) {
        return;
      }

      const point = getMousePosition(e);

      if (currentTool === "hand") {
        setStartPan(point);
        return;
      }

      if (currentTool === "text") {
        if (!hasEditAccess) return;
        setTextPosition(point);
        return;
      }

      if (currentTool === "select") {
        let foundResizeHandle = false;
        for (const elementId of selectedElements) {
          const element = elements.find((el) => el.id === elementId);
          if (element) {
            const handle = getResizeHandle(point, element);
            if (handle && hasEditAccess) {
              setIsResizing(true);
              setResizeHandle(handle);
              setDragStart(point);
              foundResizeHandle = true;
              break;
            }
          }
        }

        if (foundResizeHandle) {
          return;
        }

        const elementsAtPoint = getElementsAtPoint(point);

        if (elementsAtPoint.length > 0) {
          const topElement = elementsAtPoint[elementsAtPoint.length - 1];

          if (selectedElements.includes(topElement.id)) {
            if (hasEditAccess) {
              setIsDragging(true);
              setDragStart(point);
            }
          } else {
            setSelectedElements((prev) =>
              e.ctrlKey || e.metaKey
                ? prev.includes(topElement.id)
                  ? prev.filter((id) => id !== topElement.id)
                  : [...prev, topElement.id]
                : [topElement.id]
            );

            if (hasEditAccess) {
              setIsDragging(true);
              setDragStart(point);
            }
          }
        } else {
          if (!e.ctrlKey && !e.metaKey) {
            setSelectedElements([]);
          }
        }
        return;
      }

      if (currentTool === "eraser") {
        if (!hasEditAccess) return;
        const elementsToDelete = getElementsAtPoint(point);
        if (elementsToDelete.length > 0) {
          deleteElements(elementsToDelete.map((el) => el.id));
        }
        setIsDrawing(true);
        return;
      }

      if (!hasEditAccess) return;

      setIsDrawing(true);

      const newElement: DrawingElement = {
        id: generateId(),
        type:
          currentTool === "pen"
            ? "freehand"
            : currentTool === "rectangle"
              ? "rectangle"
              : currentTool === "circle"
                ? "circle"
                : currentTool === "line"
                  ? "line"
                  : currentTool === "arrow"
                    ? "arrow"
                    : "freehand",
        points: [point],
        color: currentColor,
        strokeWidth,
        fill: fillColor !== "#transparent" ? fillColor : undefined,
      };

      setCurrentElement(newElement);
    },
    [
      currentTool,
      getMousePosition,
      currentColor,
      strokeWidth,
      fillColor,
      getElementsAtPoint,
      deleteElements,
      selectedElements,
      getResizeHandle,
      elements,
      hasEditAccess,
    ]
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getMousePosition(e);

      if (currentTool === "select" && dragStart && hasEditAccess) {
        if (isResizing && resizeHandle && selectedElements.length === 1) {
          const selectedElement = elements.find(
            (el) => el.id === selectedElements[0]
          );
          if (selectedElement) {
            const originalBounds = getElementBounds(selectedElement);
            resizeElement(
              selectedElement.id,
              resizeHandle,
              point,
              originalBounds
            );
          }
          return;
        }

        if (isDragging && selectedElements.length > 0) {
          const deltaX = point.x - dragStart.x;
          const deltaY = point.y - dragStart.y;
          moveElements(selectedElements, deltaX, deltaY);
          setDragStart(point);
          return;
        }
      }

      if (!isDrawing || !hasEditAccess) return;

      if (currentTool === "eraser") {
        const elementsToDelete = getElementsAtPoint(point);
        if (elementsToDelete.length > 0) {
          deleteElements(elementsToDelete.map((el) => el.id));
        }
        return;
      }

      if (!currentElement) return;

      if (currentElement.type === "freehand") {
        setCurrentElement({
          ...currentElement,
          points: [...currentElement.points, point],
        });
      } else {
        setCurrentElement({
          ...currentElement,
          points: [currentElement.points[0], point],
        });
      }
    },
    [
      isDrawing,
      currentElement,
      getMousePosition,
      currentTool,
      getElementsAtPoint,
      deleteElements,
      dragStart,
      isDragging,
      isResizing,
      resizeHandle,
      selectedElements,
      elements,
      getElementBounds,
      resizeElement,
      moveElements,
      hasEditAccess,
    ]
  );

  const handlePan = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (currentTool === "hand" && startPan) {
        const point = getMousePosition(e);
        setPanOffset({
          x: panOffset.x + (point.x - startPan.x) * zoom,
          y: panOffset.y + (point.y - startPan.y) * zoom,
        });
      }
    },
    [currentTool, startPan, getMousePosition, panOffset, zoom]
  );

  // FIXED: Better stopDrawing logic that properly handles element completion
  const stopDrawing = useCallback(() => {
    if (
      isDrawing &&
      currentElement &&
      currentTool !== "eraser" &&
      hasEditAccess
    ) {
      setElements((prev) => [...prev, currentElement]);
      saveToHistory();
    }

    if ((isDragging || isResizing) && hasEditAccess) {
      saveToHistory();
    }

    setIsDrawing(false);
    setCurrentElement(null);
    setStartPan(null);
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setDragStart(null);
  }, [
    isDrawing,
    currentElement,
    saveToHistory,
    currentTool,
    isDragging,
    isResizing,
    hasEditAccess,
  ]);

  const handleTextSubmit = useCallback(() => {
    if (!hasEditAccess) {
      toast.error("You don't have permission to add text to this whiteboard.");
      return;
    }

    if (textInput && textPosition) {
      const textElement: DrawingElement = {
        id: generateId(),
        type: "text",
        points: [textPosition],
        color: currentColor,
        strokeWidth,
        text: textInput,
        fontSize,
      };

      setElements((prev) => [...prev, textElement]);
      saveToHistory();
      setTextInput("");
      setTextPosition(null);
    }
  }, [
    textInput,
    textPosition,
    currentColor,
    strokeWidth,
    fontSize,
    saveToHistory,
    hasEditAccess,
  ]);

  const handleTextCancel = () => {
    setTextPosition(null);
    setTextInput("");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" || (e.ctrlKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            break;
          case "y":
            e.preventDefault();
            handleRedo();
            break;
          case "s":
            e.preventDefault();
            saveWhiteboard();
            break;
          case "a":
            e.preventDefault();
            setSelectedElements(elements.map((el) => el.id));
            break;
          case "=":
          case "+":
            e.preventDefault();
            handleZoomIn();
            break;
          case "-":
            e.preventDefault();
            handleZoomOut();
            break;
          case "0":
            e.preventDefault();
            handleResetZoom();
            break;
        }
      } else {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }

        switch (e.key.toLowerCase()) {
          case "v":
            setCurrentTool("select");
            break;
          case "p":
            if (hasEditAccess) setCurrentTool("pen");
            break;
          case "r":
            if (hasEditAccess) setCurrentTool("rectangle");
            break;
          case "c":
            if (hasEditAccess) setCurrentTool("circle");
            break;
          case "l":
            if (hasEditAccess) setCurrentTool("line");
            break;
          case "a":
            if (hasEditAccess) setCurrentTool("arrow");
            break;
          case "t":
            if (hasEditAccess) setCurrentTool("text");
            break;
          case "e":
            if (hasEditAccess) setCurrentTool("eraser");
            break;
          case "h":
            setCurrentTool("hand");
            break;
          case "g":
            e.preventDefault();
            setShowGrid((prev) => !prev);
            break;
          case "delete":
          case "backspace":
            e.preventDefault();
            deleteSelectedElements();
            break;
          case "escape":
            e.preventDefault();
            setSelectedElements([]);
            break;
          case " ":
            e.preventDefault();
            if (currentTool !== "hand") {
              setCurrentTool("hand");
            }
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " && currentTool === "hand") {
        setCurrentTool("select");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    handleUndo,
    handleRedo,
    saveWhiteboard,
    elements,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    deleteSelectedElements,
    currentTool,
    hasEditAccess,
  ]);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        disabled={!hasEditAccess}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopToolbar
          historyStep={historyStep}
          historyLength={history.length}
          zoom={zoom}
          showGrid={showGrid}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onToggleGrid={() => setShowGrid(!showGrid)}
          onSave={saveWhiteboard}
          onLoad={loadWhiteboard}
          disabled={!hasEditAccess}
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
  disabled={!hasEditAccess}
  isSaving={isSaving}
  lastSaved={lastSaved}
/>

        <div className="flex-1 relative overflow-hidden bg-gray-50">
          {/* Access Status Indicator */}
          {!hasEditAccess && (
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
            <div className="absolute top-4 left-4 bg-blue-100 border border-blue-300 rounded-lg p-2 z-10 max-w-[300px]">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-blue-800 flex-shrink-0">
                  {selectedElements.length} element
                  {selectedElements.length > 1 ? "s" : ""} selected
                </span>
                {hasEditAccess && (
                  <button
                    onClick={deleteSelectedElements}
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
            width={canvasSize.width}
            height={canvasSize.height}
            onMouseDown={startDrawing}
            onMouseMove={(e) => {
              draw(e);
              handlePan(e);

              // Update eraser cursor position
              if (currentTool === "eraser" && hasEditAccess) {
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
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onMouseEnter={(e) => {
              if (currentTool === "eraser" && hasEditAccess) {
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
                    : currentTool === "eraser" && hasEditAccess
                      ? "none"
                      : hasEditAccess
                        ? "crosshair"
                        : "not-allowed",
            }}
          />

          {/* Eraser cursor */}
          {currentTool === "eraser" && hasEditAccess && (
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
            textPosition={textPosition}
            textInput={textInput}
            zoom={zoom}
            panOffset={panOffset}
            onTextChange={setTextInput}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
            disabled={!hasEditAccess}
          />
        </div>
      </div>
    </div>
  );
};

export default WhiteboardCanvas;

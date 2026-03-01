import { useCallback, useRef, useState } from "react";
import {
  DrawingElement,
  Point,
  Tool,
  Bounds,
} from "@/features/whiteboard/types/whiteboard.types";
import { getConnectionHandles } from "@/features/whiteboard/utils/canvas-render-utils";

interface ConnectionDraft {
  fromElementId: string;
  fromHandle: string;
  currentPoint: Point;
}

interface UseWhiteboardDrawingProps {
  currentTool: Tool;
  currentColor: string;
  strokeWidth: number;
  fillColor: string;
  hasEditAccess: boolean;
  getMousePosition: (e: React.MouseEvent<HTMLCanvasElement>) => Point;
  generateId: () => string;
  getElementsAtPoint: (point: Point, radius?: number) => DrawingElement[];
  getElementsInBounds: (start: Point, end: Point) => DrawingElement[];
  getResizeHandle: (point: Point, element: DrawingElement) => string | null;
  deleteElements: (elementIds: string[]) => void;
  moveElements: (
    elementIds: string[],
    deltaX: number,
    deltaY: number,
  ) => DrawingElement[];
  resizeElement: (
    elementId: string,
    handle: string,
    point: Point,
    originalBounds: Bounds,
  ) => DrawingElement | null;
  updateElement: (element: DrawingElement) => void;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  getElementsOnPath: (p1: Point, p2: Point, radius: number) => DrawingElement[];
  eraserSize: number;
  // State management
  currentElement: DrawingElement | null;
  setCurrentElement: (element: DrawingElement | null) => void;
  selectedElements: string[];
  setSelectedElements: (
    elements: string[] | ((prev: string[]) => string[]),
  ) => void;
  elements: DrawingElement[];
  completeCurrentElement: () => void;
  saveToHistory: () => void;
  /** Called to directly add a completed arrow element (used for connection drops) */
  addElementDirect?: (element: DrawingElement) => void;
  // Viewport
  startPanning: (point: Point) => void;
  handlePan: (point: Point) => void;
  stopPanning: () => void;
}

export const useWhiteboardDrawing = ({
  currentTool,
  currentColor,
  strokeWidth,
  fillColor,
  hasEditAccess,
  getMousePosition,
  generateId,
  getElementsAtPoint,
  getElementsInBounds,
  getResizeHandle,
  deleteElements,
  moveElements,
  resizeElement,
  updateElement,
  getElementBounds,
  getElementsOnPath,
  eraserSize,
  currentElement,
  setCurrentElement,
  selectedElements,
  setSelectedElements,
  elements,
  completeCurrentElement,
  saveToHistory,
  addElementDirect,
  startPanning,
  handlePan,
  stopPanning,
}: UseWhiteboardDrawingProps) => {
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const resizeInitialBoundsRef = useRef<Bounds | null>(null);

  // Connection handle state
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] =
    useState<ConnectionDraft | null>(null);

  // Multi-selection state
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    start: Point;
    end: Point;
  } | null>(null);

  /** Get the 4 connection handle positions for an element (world coords) */
  const getElementConnectionHandles = useCallback(
    (element: DrawingElement) => {
      const bounds = getElementBounds(element);
      return getConnectionHandles(element, bounds);
    },
    [getElementBounds],
  );

  // Mouse event handlers
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
        startPanning(point);
        return;
      }

      if (currentTool === "text") {
        // Text is completely handled at the page level now.
        return;
      }

      if (currentTool === "select") {
        // ── Connection handle check (takes priority over resize/select) ──────
        if (hasEditAccess && hoveredElementId) {
          const hoveredEl = elements.find((el) => el.id === hoveredElementId);
          if (hoveredEl) {
            const handles = getElementConnectionHandles(hoveredEl);
            const HANDLE_RADIUS = 12; // px in world space
            for (const handle of handles) {
              const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
              if (dist <= HANDLE_RADIUS) {
                setConnectionDraft({
                  fromElementId: hoveredElementId,
                  fromHandle: handle.name,
                  currentPoint: point,
                });
                return;
              }
            }
          }
        }

        // ── Existing resize / select / drag logic ─────────────────────────
        let foundResizeHandle = false;
        for (const elementId of selectedElements) {
          const element = elements.find((el) => el.id === elementId);
          if (element) {
            const handle = getResizeHandle(point, element);
            if (handle && hasEditAccess) {
              setIsResizing(true);
              setResizeHandle(handle);
              setDragStart(point);
              resizeInitialBoundsRef.current = getElementBounds(element);
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
                  ? prev.filter((id: string) => id !== topElement.id)
                  : [...prev, topElement.id]
                : [topElement.id],
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
          if (hasEditAccess) {
            setIsSelectingArea(true);
            setSelectionBox({ start: point, end: point });
          }
        }
        return;
      }

      if (currentTool === "eraser") {
        if (!hasEditAccess) return;
        const elementsToDelete = getElementsAtPoint(point, eraserSize / 2);
        if (elementsToDelete.length > 0) {
          deleteElements(elementsToDelete.map((el) => el.id));
        }
        setIsDrawing(true);
        lastPointRef.current = point;
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
        label:
          currentTool === "rectangle" || currentTool === "circle"
            ? "TEXT"
            : undefined,
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
      generateId,
      setSelectedElements,
      setCurrentElement,
      startPanning,
      eraserSize,
      getElementBounds,
      hoveredElementId,
      getElementConnectionHandles,
    ],
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getMousePosition(e);
      setCursorPosition(point);

      if (currentTool === "hand") {
        handlePan(point);
        return;
      }

      // ── Track hovered shape for connection handles ───────────────────────
      if (currentTool === "select") {
        // If dragging a connection, just update its endpoint
        if (connectionDraft) {
          setConnectionDraft((prev) =>
            prev ? { ...prev, currentPoint: point } : null,
          );
          return;
        }

        // Update hovered element (only rect/circle expose handles)
        const atPoint = getElementsAtPoint(point);
        const connectable = [...atPoint]
          .reverse()
          .find((el) => el.type === "rectangle" || el.type === "circle");
        setHoveredElementId(connectable?.id ?? null);
      } else {
        // Clear hover when not on select tool
        setHoveredElementId(null);
      }

      if (currentTool === "select" && hasEditAccess) {
        if (isSelectingArea && selectionBox) {
          setSelectionBox({
            start: selectionBox.start,
            end: point,
          });
          return;
        }

        if (dragStart) {
          if (
            isResizing &&
            resizeHandle &&
            selectedElements.length === 1 &&
            resizeInitialBoundsRef.current
          ) {
            const selectedElement = elements.find(
              (el) => el.id === selectedElements[0],
            );
            if (selectedElement) {
              const updated = resizeElement(
                selectedElement.id,
                resizeHandle,
                point,
                resizeInitialBoundsRef.current,
              );
              if (updated) {
                updateElement(updated);
              }
            }
            return;
          }

          if (isDragging && selectedElements.length > 0) {
            const deltaX = point.x - dragStart.x;
            const deltaY = point.y - dragStart.y;
            const updatedElements = moveElements(
              selectedElements,
              deltaX,
              deltaY,
            );
            updatedElements.forEach((el) => updateElement(el));
            setDragStart(point);
          }
        }
      }

      if (!isDrawing || !hasEditAccess) return;

      if (currentTool === "eraser") {
        if (lastPointRef.current) {
          const elementsToDelete = getElementsOnPath(
            lastPointRef.current,
            point,
            eraserSize / 2,
          );
          if (elementsToDelete.length > 0) {
            deleteElements(elementsToDelete.map((el) => el.id));
          }
        }
        lastPointRef.current = point;
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
      setCurrentElement,
      handlePan,
      eraserSize,
      getElementsOnPath,
      dragStart,
      isDragging,
      isResizing,
      isSelectingArea,
      selectionBox,
      resizeHandle,
      selectedElements,
      elements,
      resizeElement,
      updateElement,
      moveElements,
      hasEditAccess,
      deleteElements,
      connectionDraft,
      getElementsAtPoint,
    ],
  );

  const stopDrawing = useCallback(() => {
    // ── Complete a connection drag ────────────────────────────────────────
    if (connectionDraft) {
      const targetElements = getElementsAtPoint(connectionDraft.currentPoint);
      const target = [...targetElements]
        .reverse()
        .find(
          (el) =>
            (el.type === "rectangle" || el.type === "circle") &&
            el.id !== connectionDraft.fromElementId,
        );

      if (target && addElementDirect) {
        const fromEl = elements.find(
          (el) => el.id === connectionDraft.fromElementId,
        );
        if (fromEl) {
          const fromHandles = getElementConnectionHandles(fromEl);
          const fromHandle = fromHandles.find(
            (h) => h.name === connectionDraft.fromHandle,
          );
          const toHandles = getElementConnectionHandles(target);

          // Find nearest target handle to the cursor
          let nearestToHandle = toHandles[0];
          let minDist = Infinity;
          for (const h of toHandles) {
            const d = Math.hypot(
              connectionDraft.currentPoint.x - h.x,
              connectionDraft.currentPoint.y - h.y,
            );
            if (d < minDist) {
              minDist = d;
              nearestToHandle = h;
            }
          }

          if (fromHandle && nearestToHandle) {
            addElementDirect({
              id: generateId(),
              type: "arrow",
              points: [
                { x: fromHandle.x, y: fromHandle.y },
                { x: nearestToHandle.x, y: nearestToHandle.y },
              ],
              color: "#475569",
              strokeWidth: 2,
              startConnection: {
                elementId: fromEl.id,
                handle: fromHandle.name,
              },
              endConnection: {
                elementId: target.id,
                handle: nearestToHandle.name,
              },
            });
          }
        }
      }
      setConnectionDraft(null);
      return;
    }

    if (isSelectingArea && selectionBox) {
      if (
        Math.abs(selectionBox.start.x - selectionBox.end.x) > 5 ||
        Math.abs(selectionBox.start.y - selectionBox.end.y) > 5
      ) {
        const intersectedElements = getElementsInBounds(
          selectionBox.start,
          selectionBox.end,
        );
        setSelectedElements(intersectedElements.map((el) => el.id));
      }
      setIsSelectingArea(false);
      setSelectionBox(null);
    }

    if (
      isDrawing &&
      currentElement &&
      currentTool !== "eraser" &&
      hasEditAccess
    ) {
      completeCurrentElement();
    }

    if ((isDragging || isResizing) && hasEditAccess) {
      saveToHistory();
    }

    setIsDrawing(false);
    setCurrentElement(null);
    stopPanning();
    setIsDragging(false);
    setIsResizing(false);
    setIsSelectingArea(false);
    setSelectionBox(null);
    setResizeHandle(null);
    setDragStart(null);
    lastPointRef.current = null;
  }, [
    isDrawing,
    currentElement,
    completeCurrentElement,
    currentTool,
    isDragging,
    isResizing,
    isSelectingArea,
    selectionBox,
    getElementsInBounds,
    hasEditAccess,
    saveToHistory,
    setCurrentElement,
    setSelectedElements,
    stopPanning,
    connectionDraft,
    getElementsAtPoint,
    addElementDirect,
    elements,
    getElementConnectionHandles,
    generateId,
  ]);

  // Text handling
  const handleTextSubmit = useCallback(
    (text: string, fontSize: number) => {
      if (!hasEditAccess) {
        return false;
      }

      if (text && textPosition) {
        const textElement: DrawingElement = {
          id: generateId(),
          type: "text",
          points: [textPosition],
          color: currentColor,
          strokeWidth,
          text,
          fontSize,
        };

        setCurrentElement(textElement);
        completeCurrentElement();
        setTextPosition(null);
        return true;
      }
      return false;
    },
    [
      textPosition,
      currentColor,
      strokeWidth,
      hasEditAccess,
      generateId,
      setCurrentElement,
      completeCurrentElement,
    ],
  );

  const handleTextCancel = useCallback(() => {
    setTextPosition(null);
  }, []);

  return {
    // State
    isDrawing,
    isDragging,
    isResizing,
    isSelectingArea,
    selectionBox,
    textPosition,

    // Connection state
    hoveredElementId,
    connectionDraft,

    // Actions
    startDrawing,
    draw,
    stopDrawing,
    handleTextSubmit,
    handleTextCancel,
    cursorPosition,
    setCursorPosition,

    // Computed
    hasActiveDrawing: isDrawing || isDragging || isResizing || isSelectingArea,
  };
};

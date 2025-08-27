import { useCallback, useState } from "react";
import { DrawingElement, Point, Tool } from "@/types/whiteboard.types";

interface UseWhiteboardDrawingProps {
  currentTool: Tool;
  currentColor: string;
  strokeWidth: number;
  fillColor: string;
  hasEditAccess: boolean;
  getMousePosition: (e: React.MouseEvent<HTMLCanvasElement>) => Point;
  generateId: () => string;
  getElementsAtPoint: (point: Point) => DrawingElement[];
  getResizeHandle: (point: Point, element: DrawingElement) => string | null;
  deleteElements: (elementIds: string[]) => void;
  moveElements: (elementIds: string[], deltaX: number, deltaY: number) => void;
  resizeElement: (elementId: string, handle: string, point: Point, originalBounds: any) => void;
  getElementBounds: (element: DrawingElement) => any;
  // State management
  currentElement: DrawingElement | null;
  setCurrentElement: any;
  selectedElements: string[];
  setSelectedElements: any;
  elements: DrawingElement[];
  completeCurrentElement: () => void;
  saveToHistory: () => void;
  // Viewport
  startPanning: (point: Point) => void;
  handlePan: (point: Point) => void;
  stopPanning: () => void;
}

export const useWhiteboardDrawing = (
  {
  currentTool,
  currentColor,
  strokeWidth,
  fillColor,
  hasEditAccess,
  getMousePosition,
  generateId,
  getElementsAtPoint,
  getResizeHandle,
  deleteElements,
  moveElements,
  resizeElement,
  getElementBounds,
  currentElement,
  setCurrentElement,
  selectedElements,
  setSelectedElements,
  elements,
  completeCurrentElement,
  saveToHistory,
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

  // Mouse event handlers
  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!hasEditAccess && currentTool !== "hand" && currentTool !== "select") {
        return;
      }

      const point = getMousePosition(e);

      if (currentTool === "hand") {
        startPanning(point);
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
            setSelectedElements((prev:any) =>
              e.ctrlKey || e.metaKey
                ? prev.includes(topElement.id)
                  ? prev.filter((id:string) => id !== topElement.id)
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
      generateId,
      setSelectedElements,
      setCurrentElement,
      startPanning,
    ]
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getMousePosition(e);

      if (currentTool === "hand") {
        handlePan(point);
        return;
      }

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
      setCurrentElement,
      handlePan,
    ]
  );

  const stopDrawing = useCallback(() => {
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
    setResizeHandle(null);
    setDragStart(null);
  }, [
    isDrawing,
    currentElement,
    completeCurrentElement,
    currentTool,
    isDragging,
    isResizing,
    hasEditAccess,
    saveToHistory,
    setCurrentElement,
    stopPanning,
  ]);

  // Text handling
  const handleTextSubmit = useCallback((text: string, fontSize: number) => {
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
  }, [
    textPosition,
    currentColor,
    strokeWidth,
    hasEditAccess,
    generateId,
    setCurrentElement,
    completeCurrentElement,
  ]);

  const handleTextCancel = useCallback(() => {
    setTextPosition(null);
  }, []);

  return {
    // State
    isDrawing,
    isDragging,
    isResizing,
    textPosition,
    
    // Actions
    startDrawing,
    draw,
    stopDrawing,
    handleTextSubmit,
    handleTextCancel,
    
    // Computed
    hasActiveDrawing: isDrawing || isDragging || isResizing,
  };
};
import { useCallback } from "react";
import { DrawingElement, Point } from "@/types/whiteboard.types";

export const useWhiteboardUtils = (
  zoom: number,
  elements: DrawingElement[],
  setElements: React.Dispatch<React.SetStateAction<DrawingElement[]>>
) => {
  // Generate unique ID for elements
  const generateId = useCallback(() => {
    return Math.random().toString(36).substr(2, 9);
  }, []);

  // Get element bounds
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

  // Get all elements at a specific point
  const getElementsAtPoint = useCallback(
    (point: Point): DrawingElement[] => {
      return elements.filter((element) => isPointInElement(point, element));
    },
    [elements, isPointInElement]
  );

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

  // Move elements
  const moveElements = useCallback(
    (elementIds: string[], deltaX: number, deltaY: number) => {
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
    [setElements]
  );

  // Resize element
  const resizeElement = useCallback(
    (elementId: string, handle: string, point: Point, originalBounds: any) => {
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
    [setElements]
  );

  // Delete elements
  const deleteElements = useCallback(
    (elementIds: string[]) => {
      setElements((prev) =>
        prev.filter((element) => !elementIds.includes(element.id))
      );
    },
    [setElements]
  );

  return {
    generateId,
    getElementBounds,
    isPointInElement,
    getElementsAtPoint,
    getResizeHandle,
    moveElements,
    resizeElement,
    deleteElements,
  };
};
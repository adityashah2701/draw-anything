import { useCallback } from "react";
import {
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";

export const useWhiteboardUtils = (
  zoom: number,
  elements: DrawingElement[],
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
        Math.pow(edgeX - centerX, 2) + Math.pow(edgeY - centerY, 2),
      );

      minX = centerX - radius;
      minY = centerY - radius;
      maxX = centerX + radius;
      maxY = centerY + radius;
    } else if (element.type === "text" && element.text && element.fontSize) {
      const textX = element.points[0].x;
      const textY = element.points[0].y;

      const weight =
        element.fontWeight ||
        (element.fontSize >= 36
          ? "800"
          : element.fontSize >= 26
            ? "700"
            : element.fontSize >= 20
              ? "600"
              : "400");
      const baseSize = element.fontSize;
      let effectiveSize = baseSize;
      if (weight === "800") effectiveSize = Math.max(baseSize, 36);
      else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
      else if (weight === "600" && baseSize >= 20)
        effectiveSize = Math.max(baseSize, 20);

      const lines = element.text.split("\n");
      const maxChars = Math.max(...lines.map((l) => l.length));
      // Use a more accurate width multiplier for Inter (approx 0.62)
      const textWidth = maxChars * effectiveSize * 0.62 + 8;
      const textHeight = lines.length * effectiveSize * 1.2 + 8;

      minX = textX - 4;
      minY = textY - 4;
      maxX = textX + textWidth;
      maxY = textY + textHeight;
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
    (point: Point, element: DrawingElement, radius = 0): boolean => {
      const tolerance = 10 + radius;

      switch (element.type) {
        case "freehand":
          return element.points.some(
            (p) =>
              Math.abs(p.x - point.x) < tolerance &&
              Math.abs(p.y - point.y) < tolerance,
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
              Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2),
            );
            const distance = Math.sqrt(
              Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2),
            );
            return distance <= radius;
          }
          break;

        case "line":
        case "arrow":
          if (element.points.length === 2) {
            const [start, end] = element.points;
            const lineLength = Math.sqrt(
              Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2),
            );
            const distanceToStart = Math.sqrt(
              Math.pow(point.x - start.x, 2) + Math.pow(point.y - start.y, 2),
            );
            const distanceToEnd = Math.sqrt(
              Math.pow(point.x - end.x, 2) + Math.pow(point.y - end.y, 2),
            );
            return (
              Math.abs(distanceToStart + distanceToEnd - lineLength) < tolerance
            );
          }
          break;

        case "text":
          if (element.text && element.fontSize) {
            const weight =
              element.fontWeight ||
              (element.fontSize >= 36
                ? "800"
                : element.fontSize >= 26
                  ? "700"
                  : element.fontSize >= 20
                    ? "600"
                    : "400");
            const baseSize = element.fontSize;
            let effectiveSize = baseSize;
            if (weight === "800") effectiveSize = Math.max(baseSize, 36);
            else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
            else if (weight === "600" && baseSize >= 20)
              effectiveSize = Math.max(baseSize, 20);

            // Re-use logic from getElementBounds for consistency
            const bounds = getElementBounds(element);
            if (!bounds) return false;
            return (
              point.x >= bounds.minX &&
              point.x <= bounds.maxX &&
              point.y >= bounds.minY &&
              point.y <= bounds.maxY
            );
          }
          break;
      }
      return false;
    },
    [getElementBounds],
  );

  // Check if a path (line segment from p1 to p2) intersects with an element
  const isPathIntersectingElement = useCallback(
    (p1: Point, p2: Point, element: DrawingElement, radius = 0): boolean => {
      // Basic approach: checking points along the path
      // For more complex shapes, we might want a better intersection check,
      // but for eraser, sampling enough points along the segment is usually sufficient
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.floor(distance / 5)); // Sample every 5px

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sampledPoint = {
          x: p1.x + dx * t,
          y: p1.y + dy * t,
        };
        if (isPointInElement(sampledPoint, element, radius)) {
          return true;
        }
      }
      return false;
    },
    [isPointInElement],
  );

  // Get all elements at a specific point or within a radius
  const getElementsAtPoint = useCallback(
    (point: Point, radius = 0): DrawingElement[] => {
      return elements.filter((element) =>
        isPointInElement(point, element, radius),
      );
    },
    [elements, isPointInElement],
  );

  // Get all elements intersected by a path
  const getElementsOnPath = useCallback(
    (p1: Point, p2: Point, radius = 0): DrawingElement[] => {
      return elements.filter((element) =>
        isPathIntersectingElement(p1, p2, element, radius),
      );
    },
    [elements, isPathIntersectingElement],
  );

  // Get all elements completely or partially inside a bounding box
  const getElementsInBounds = useCallback(
    (boxStart: Point, boxEnd: Point): DrawingElement[] => {
      const boxMinX = Math.min(boxStart.x, boxEnd.x);
      const boxMaxX = Math.max(boxStart.x, boxEnd.x);
      const boxMinY = Math.min(boxStart.y, boxEnd.y);
      const boxMaxY = Math.max(boxStart.y, boxEnd.y);

      return elements.filter((element) => {
        const bounds = getElementBounds(element);
        if (!bounds) return false;

        // Check for intersection between the element bounds and the selection box
        return (
          bounds.minX <= boxMaxX &&
          bounds.maxX >= boxMinX &&
          bounds.minY <= boxMaxY &&
          bounds.maxY >= boxMinY
        );
      });
    },
    [elements, getElementBounds],
  );

  // Check if point is on resize handle
  const getResizeHandle = useCallback(
    (point: Point, element: DrawingElement): string | null => {
      const bounds = getElementBounds(element);
      if (!bounds) return null;

      const handleSize = 8 / zoom;
      const { minX, minY, maxX, maxY } = bounds;

      let handles: { name: string; x: number; y: number }[] = [];

      if (element.type === "line" || element.type === "arrow") {
        if (element.points.length >= 2) {
          handles = [
            { name: "start", x: element.points[0].x, y: element.points[0].y },
            { name: "end", x: element.points[1].x, y: element.points[1].y },
          ];
        }
      } else {
        handles = [
          { name: "nw", x: minX, y: minY },
          { name: "n", x: (minX + maxX) / 2, y: minY },
          { name: "ne", x: maxX, y: minY },
          { name: "e", x: maxX, y: (minY + maxY) / 2 },
          { name: "se", x: maxX, y: maxY },
          { name: "s", x: (minX + maxX) / 2, y: maxY },
          { name: "sw", x: minX, y: maxY },
          { name: "w", x: minX, y: (minY + maxY) / 2 },
        ];
      }

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
    [getElementBounds, zoom],
  );

  // Move elements
  const moveElements = useCallback(
    (
      elementIds: string[],
      deltaX: number,
      deltaY: number,
    ): DrawingElement[] => {
      return elements
        .filter((element) => elementIds.includes(element.id))
        .map((element) => ({
          ...element,
          points: element.points.map((point) => ({
            x: point.x + deltaX,
            y: point.y + deltaY,
          })),
        }));
    },
    [elements],
  );

  // Resize element
  const resizeElement = useCallback(
    (
      elementId: string,
      handle: string,
      point: Point,
      originalBounds: any,
    ): DrawingElement | null => {
      const element = elements.find((e) => e.id === elementId);
      if (!element) return null;

      const bounds = originalBounds;
      let newPoints = [...element.points];
      let newFontSize = element.fontSize;

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
          let [start, end] = element.points;
          if (handle === "start") {
            start = { x: point.x, y: point.y };
          } else if (handle === "end") {
            end = { x: point.x, y: point.y };
          } else {
            // Fallback if somehow using old handles
            end = { x: point.x, y: point.y };
          }
          newPoints = [start, end];
        }
      } else if (element.type === "text" && element.text && element.fontSize) {
        // For text elements, scaling dragging SE/NW etc scales the font size.
        // We use the change in distance to scale the text
        const currentWidth = bounds.maxX - bounds.minX;
        let scaleFactor = 1;

        switch (handle) {
          case "se":
          case "e":
            scaleFactor = Math.max(0.1, (point.x - bounds.minX) / currentWidth);
            break;
          case "sw":
          case "w":
            scaleFactor = Math.max(0.1, (bounds.maxX - point.x) / currentWidth);
            // Move origin left when dragging left handles
            newPoints[0] = { x: point.x, y: element.points[0].y };
            break;
          case "nw":
            scaleFactor = Math.max(0.1, (bounds.maxX - point.x) / currentWidth);
            // Move origin left/up when dragging top-left
            newPoints[0] = {
              x: point.x,
              y: point.y + bounds.height * scaleFactor,
            };
            break;
          case "ne":
            scaleFactor = Math.max(0.1, (point.x - bounds.minX) / currentWidth);
            // Move origin up when dragging top-right
            newPoints[0] = {
              x: element.points[0].x,
              y: point.y + bounds.height * scaleFactor,
            };
            break;
          case "n":
            scaleFactor = Math.max(
              0.1,
              (bounds.maxY - point.y) / bounds.height,
            );
            newPoints[0] = {
              x: element.points[0].x,
              y: point.y + bounds.height * scaleFactor,
            };
            break;
          case "s":
            scaleFactor = Math.max(
              0.1,
              (point.y - bounds.minY) / bounds.height,
            );
            break;
        }

        // Apply proportional scaling to the font size
        newFontSize = Math.max(
          12,
          Math.min(200, Math.round(element.fontSize * scaleFactor)),
        );
      }

      return { ...element, points: newPoints, fontSize: newFontSize };
    },
    [elements],
  );

  return {
    generateId,
    getElementBounds,
    isPointInElement,
    getElementsAtPoint,
    isPathIntersectingElement,
    getElementsOnPath,
    getElementsInBounds,
    getResizeHandle,
    moveElements,
    resizeElement,
  };
};

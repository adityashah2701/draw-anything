import { useCallback, useMemo } from "react";
import {
  DrawingElement,
  Point,
  Bounds,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  getShapeBounds,
  getShapeResizeHandles,
  moveShape,
  resizeShape,
  shapeContainsPoint,
} from "@/core/shapes/shape-runtime";
import { SpatialHashGrid } from "@/core/routing/spatial-hash-grid";

export const useWhiteboardUtils = (
  zoom: number,
  elements: DrawingElement[],
) => {
  const SPATIAL_CELL_SIZE = 220;

  const textMeasureCtx = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  }, []);

  const getBoundsStatic = useCallback(
    (element: DrawingElement): Bounds | null =>
      getShapeBounds(element, {
        textMeasureContext: textMeasureCtx,
        zoom,
      }),
    [textMeasureCtx, zoom],
  );

  const boundsById = useMemo(() => {
    const map = new Map<string, Bounds>();
    elements.forEach((element) => {
      const bounds = getBoundsStatic(element);
      if (bounds) {
        map.set(element.id, bounds);
      }
    });
    return map;
  }, [elements, getBoundsStatic]);

  const elementsById = useMemo(() => {
    const map = new Map<string, DrawingElement>();
    elements.forEach((element) => map.set(element.id, element));
    return map;
  }, [elements]);

  const spatialIndex = useMemo(() => {
    const grid = new SpatialHashGrid<string>(SPATIAL_CELL_SIZE);

    elements.forEach((element) => {
      const bounds = boundsById.get(element.id);
      if (!bounds) return;
      grid.insertAabb(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, element.id);
    });

    return grid;
  }, [boundsById, elements]);

  const queryCandidatesInRect = useCallback(
    (minX: number, minY: number, maxX: number, maxY: number): DrawingElement[] => {
      return spatialIndex
        .queryAabb(minX, minY, maxX, maxY)
        .map((id) => elementsById.get(id))
        .filter((element): element is DrawingElement => Boolean(element));
    },
    [elementsById, spatialIndex],
  );

  const generateId = useCallback(() => Math.random().toString(36).substr(2, 9), []);

  const getElementBounds = useCallback(
    (element: DrawingElement) => boundsById.get(element.id) ?? getBoundsStatic(element),
    [boundsById, getBoundsStatic],
  );

  const isPointInElement = useCallback(
    (point: Point, element: DrawingElement, radius = 0): boolean => {
      const bounds = getElementBounds(element);
      return shapeContainsPoint(element, point, {
        radius,
        bounds,
        zoom,
      });
    },
    [getElementBounds, zoom],
  );

  const isPathIntersectingElement = useCallback(
    (p1: Point, p2: Point, element: DrawingElement, radius = 0): boolean => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.floor(distance / 5));

      for (let i = 0; i <= steps; i += 1) {
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

  const getElementsAtPoint = useCallback(
    (point: Point, radius = 0): DrawingElement[] => {
      const minX = point.x - radius;
      const minY = point.y - radius;
      const maxX = point.x + radius;
      const maxY = point.y + radius;

      const candidates = queryCandidatesInRect(minX, minY, maxX, maxY);
      return candidates.filter((element) =>
        isPointInElement(point, element, radius),
      );
    },
    [isPointInElement, queryCandidatesInRect],
  );

  const getElementsOnPath = useCallback(
    (p1: Point, p2: Point, radius = 0): DrawingElement[] => {
      const minX = Math.min(p1.x, p2.x) - radius;
      const maxX = Math.max(p1.x, p2.x) + radius;
      const minY = Math.min(p1.y, p2.y) - radius;
      const maxY = Math.max(p1.y, p2.y) + radius;

      const candidates = queryCandidatesInRect(minX, minY, maxX, maxY);
      return candidates.filter((element) =>
        isPathIntersectingElement(p1, p2, element, radius),
      );
    },
    [isPathIntersectingElement, queryCandidatesInRect],
  );

  const getElementsInBounds = useCallback(
    (boxStart: Point, boxEnd: Point): DrawingElement[] => {
      const boxMinX = Math.min(boxStart.x, boxEnd.x);
      const boxMaxX = Math.max(boxStart.x, boxEnd.x);
      const boxMinY = Math.min(boxStart.y, boxEnd.y);
      const boxMaxY = Math.max(boxStart.y, boxEnd.y);

      const candidates = queryCandidatesInRect(boxMinX, boxMinY, boxMaxX, boxMaxY);
      return candidates.filter((element) => {
        const bounds = getElementBounds(element);
        if (!bounds) return false;

        return (
          bounds.minX <= boxMaxX &&
          bounds.maxX >= boxMinX &&
          bounds.minY <= boxMaxY &&
          bounds.maxY >= boxMinY
        );
      });
    },
    [getElementBounds, queryCandidatesInRect],
  );

  const getResizeHandle = useCallback(
    (point: Point, element: DrawingElement): string | null => {
      const bounds = getElementBounds(element);
      if (!bounds) return null;

      const handleSize = 8 / zoom;
      const handles = getShapeResizeHandles(element, { bounds, zoom });

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

  const moveElements = useCallback(
    (elementIds: string[], deltaX: number, deltaY: number): DrawingElement[] => {
      return elements
        .filter((element) => elementIds.includes(element.id))
        .map((element) => moveShape(element, { x: deltaX, y: deltaY }));
    },
    [elements],
  );

  const resizeElement = useCallback(
    (
      elementId: string,
      handle: string,
      point: Point,
      originalBounds: Bounds,
    ): DrawingElement | null => {
      const element = elements.find((entry) => entry.id === elementId);
      if (!element) return null;

      return resizeShape(element, handle, point, originalBounds);
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

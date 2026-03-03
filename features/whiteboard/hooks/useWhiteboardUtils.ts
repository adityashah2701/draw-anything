import { useCallback, useMemo } from "react";
import {
  DrawingElement,
  Point,
  Bounds,
} from "@/features/whiteboard/types/whiteboard.types";
import { getArrowEditHandles, isArrowElement } from "@/core/shapes/Arrow";
import {
  compressPath,
  moveOrthogonalSegment,
  routeArrowPoints,
} from "@/core/routing/orthogonalRouter";
import { parseAnchorSide } from "@/core/anchors/generate-anchors";

export const useWhiteboardUtils = (
  zoom: number,
  elements: DrawingElement[],
) => {
  const getConnectionSide = useCallback(
    (connection?: DrawingElement["startConnection"]) => {
      if (!connection) return undefined;
      if (connection.handle) return connection.handle;
      if (connection.anchorId) return parseAnchorSide(connection.anchorId) ?? undefined;
      return undefined;
    },
    [],
  );

  const SPATIAL_CELL_SIZE = 220;
  const textMeasureCtx = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  }, []);

  const getBoundsStatic = useCallback((element: DrawingElement) => {
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
    } else if (
      element.type === "rectangle" ||
      element.type === "diamond"
    ) {
      element.points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
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
      const style = element.fontStyle || "normal";
      const lineHeight = effectiveSize * 1.2;

      let textWidth = Math.max(1, ...lines.map((l) => l.length)) * effectiveSize * 0.62;
      if (textMeasureCtx) {
        textMeasureCtx.font = `${style} ${weight} ${effectiveSize}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        textWidth = Math.max(
          ...lines.map((line) => textMeasureCtx.measureText(line || " ").width),
          1,
        );
      }
      // Match canvas draw model: first line occupies glyph height, extra lines add lineHeight step.
      const textHeight = Math.max(
        effectiveSize,
        effectiveSize + Math.max(0, lines.length - 1) * lineHeight,
      );

      minX = textX;
      minY = textY;
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
  }, [textMeasureCtx]);

  const boundsById = useMemo(() => {
    const map = new Map<string, Bounds>();
    elements.forEach((el) => {
      const bounds = getBoundsStatic(el);
      if (bounds) {
        map.set(el.id, bounds);
      }
    });
    return map;
  }, [elements, getBoundsStatic]);

  const spatialIndex = useMemo(() => {
    const grid = new Map<string, string[]>();

    elements.forEach((el) => {
      const b = boundsById.get(el.id);
      if (!b) return;

      const minCellX = Math.floor(b.minX / SPATIAL_CELL_SIZE);
      const maxCellX = Math.floor(b.maxX / SPATIAL_CELL_SIZE);
      const minCellY = Math.floor(b.minY / SPATIAL_CELL_SIZE);
      const maxCellY = Math.floor(b.maxY / SPATIAL_CELL_SIZE);

      for (let cx = minCellX; cx <= maxCellX; cx += 1) {
        for (let cy = minCellY; cy <= maxCellY; cy += 1) {
          const key = `${cx}:${cy}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key)!.push(el.id);
        }
      }
    });

    return { grid };
  }, [elements, boundsById]);

  const queryCandidatesInRect = useCallback(
    (minX: number, minY: number, maxX: number, maxY: number): DrawingElement[] => {
      const minCellX = Math.floor(minX / SPATIAL_CELL_SIZE);
      const maxCellX = Math.floor(maxX / SPATIAL_CELL_SIZE);
      const minCellY = Math.floor(minY / SPATIAL_CELL_SIZE);
      const maxCellY = Math.floor(maxY / SPATIAL_CELL_SIZE);

      const seen = new Set<string>();

      for (let cx = minCellX; cx <= maxCellX; cx += 1) {
        for (let cy = minCellY; cy <= maxCellY; cy += 1) {
          const key = `${cx}:${cy}`;
          const cell = spatialIndex.grid.get(key);
          if (!cell) continue;
          for (const id of cell) {
            seen.add(id);
          }
        }
      }

      // Preserve drawing order for "top-most wins" behavior.
      return elements.filter((el) => seen.has(el.id));
    },
    [elements, spatialIndex.grid],
  );

  // Generate unique ID for elements
  const generateId = useCallback(() => {
    return Math.random().toString(36).substr(2, 9);
  }, []);

  // Get element bounds
  const getElementBounds = useCallback((element: DrawingElement) => {
    return boundsById.get(element.id) ?? getBoundsStatic(element);
  }, [boundsById, getBoundsStatic]);

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

        case "diamond":
          if (element.points.length === 2) {
            const [p1, p2] = element.points;
            const left = Math.min(p1.x, p2.x);
            const right = Math.max(p1.x, p2.x);
            const top = Math.min(p1.y, p2.y);
            const bottom = Math.max(p1.y, p2.y);
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            const halfW = Math.max(1, (right - left) / 2);
            const halfH = Math.max(1, (bottom - top) / 2);

            // Diamond equation in normalized space: |dx| + |dy| <= 1
            const nx = Math.abs((point.x - cx) / halfW);
            const ny = Math.abs((point.y - cy) / halfH);
            return nx + ny <= 1;
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
        case "arrow-bidirectional":
          if (element.points.length >= 2) {
            for (let i = 0; i < element.points.length - 1; i += 1) {
              const start = element.points[i];
              const end = element.points[i + 1];
              const lineLength = Math.sqrt(
                Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2),
              );
              const distanceToStart = Math.sqrt(
                Math.pow(point.x - start.x, 2) + Math.pow(point.y - start.y, 2),
              );
              const distanceToEnd = Math.sqrt(
                Math.pow(point.x - end.x, 2) + Math.pow(point.y - end.y, 2),
              );

              if (
                Math.abs(distanceToStart + distanceToEnd - lineLength) <
                tolerance
              ) {
                return true;
              }
            }
          }
          break;

        case "text":
          if (element.text && element.fontSize) {
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

  // Get all elements intersected by a path
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

  // Get all elements completely or partially inside a bounding box
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

        // Check for intersection between the element bounds and the selection box
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

  // Check if point is on resize handle
  const getResizeHandle = useCallback(
    (point: Point, element: DrawingElement): string | null => {
      const bounds = getElementBounds(element);
      if (!bounds) return null;

      const handleSize = 8 / zoom;
      let { minX, minY, maxX, maxY } = bounds;

      // Add padding for stroke width so handles are on the outer edge
      if (
        element.type !== "text" &&
        element.type !== "line" &&
        element.type !== "arrow" &&
        element.type !== "arrow-bidirectional"
      ) {
        const padding = (element.strokeWidth || 2) / 2;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;
      }

      let handles: { name: string; x: number; y: number }[] = [];

      if (element.type === "line") {
        if (element.points.length >= 2) {
          const endIndex = element.points.length - 1;
          handles = [
            { name: "start", x: element.points[0].x, y: element.points[0].y },
            {
              name: "end",
              x: element.points[endIndex].x,
              y: element.points[endIndex].y,
            },
          ];
        }
      } else if (isArrowElement(element)) {
        const arrowHandles = getArrowEditHandles(element.points).filter(
          (handleItem) => handleItem.kind !== "bend",
        );
        handles = arrowHandles.map((handleItem) => ({
          name: handleItem.name,
          x: handleItem.point.x,
          y: handleItem.point.y,
        }));
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
      originalBounds: Bounds,
    ): DrawingElement | null => {
      const element = elements.find((e) => e.id === elementId);
      if (!element) return null;

      const bounds = originalBounds;
      let newPoints = [...element.points];
      let newFontSize = element.fontSize;

      if (
        element.type === "rectangle" ||
        element.type === "circle" ||
        element.type === "diamond"
      ) {
        const padding = (element.strokeWidth || 2) / 2;
        let pMinX = bounds.minX - padding;
        let pMinY = bounds.minY - padding;
        let pMaxX = bounds.maxX + padding;
        let pMaxY = bounds.maxY + padding;

        switch (handle) {
          case "nw":
            pMinX = point.x;
            pMinY = point.y;
            break;
          case "ne":
            pMaxX = point.x;
            pMinY = point.y;
            break;
          case "se":
            pMaxX = point.x;
            pMaxY = point.y;
            break;
          case "sw":
            pMinX = point.x;
            pMaxY = point.y;
            break;
          case "n":
            pMinY = point.y;
            break;
          case "s":
            pMaxY = point.y;
            break;
          case "e":
            pMaxX = point.x;
            break;
          case "w":
            pMinX = point.x;
            break;
        }

        // Prevent negative dimensions by enforcing minimum size
        if (pMaxX - pMinX < 10) pMaxX = pMinX + 10;
        if (pMaxY - pMinY < 10) pMaxY = pMinY + 10;

        // Unpad to get the inner mathematical bounds
        const minX = pMinX + padding;
        const minY = pMinY + padding;
        const maxX = pMaxX - padding;
        const maxY = pMaxY - padding;

        if (element.type === "rectangle" || element.type === "diamond") {
          newPoints = [
            { x: minX, y: minY },
            { x: maxX, y: maxY },
          ];
        } else if (element.type === "circle") {
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          // Radius is half of either width or height (we can constrain to a perfect circle)
          const radius = Math.max(1, Math.min(maxX - minX, maxY - minY) / 2);

          newPoints = [
            { x: centerX, y: centerY },
            { x: centerX + radius, y: centerY },
          ];
        }
      } else if (element.type === "line") {
        if (element.points.length >= 2) {
          const nextPoints = [...element.points];
          let start = nextPoints[0];
          let end = nextPoints[nextPoints.length - 1];

          if (handle === "start") {
            start = { x: point.x, y: point.y };
          } else if (handle === "end") {
            end = { x: point.x, y: point.y };
          } else {
            end = { x: point.x, y: point.y };
          }

          nextPoints[0] = start;
          nextPoints[nextPoints.length - 1] = end;
          newPoints = nextPoints;
        }
      } else if (isArrowElement(element)) {
        if (element.points.length >= 2) {
          const nextPoints = element.points.map((pt) => ({ ...pt }));
          const lastPointIndex = nextPoints.length - 1;

          if (handle === "start" || handle === "end") {
            if (handle === "start") {
              nextPoints[0] = { x: point.x, y: point.y };
            } else {
              nextPoints[lastPointIndex] = { x: point.x, y: point.y };
            }

            newPoints = routeArrowPoints({
              start: nextPoints[0],
              end: nextPoints[lastPointIndex],
              startHandle: getConnectionSide(element.startConnection),
              endHandle: getConnectionSide(element.endConnection),
              routePreference: element.routePreference,
              routingMode: element.routingMode ?? "orthogonal",
              existingPoints: nextPoints,
              preserveManualBends: Boolean(element.isManuallyRouted),
            });
          } else if (handle.startsWith("segment-")) {
            const segmentIndex = Number(handle.split("-")[1]);
            const lastSegmentIndex = nextPoints.length - 2;
            let orthogonalPoints = nextPoints;

            if (
              !Number.isFinite(segmentIndex) ||
              (element.routingMode ?? "orthogonal") === "straight" ||
              orthogonalPoints.length < 3
            ) {
              const start = orthogonalPoints[0];
              const end = orthogonalPoints[lastPointIndex];
              const dx = Math.abs(end.x - start.x);
              const dy = Math.abs(end.y - start.y);

              if (dx >= dy) {
                orthogonalPoints = [
                  start,
                  { x: start.x, y: point.y },
                  { x: end.x, y: point.y },
                  end,
                ];
              } else {
                orthogonalPoints = [
                  start,
                  { x: point.x, y: start.y },
                  { x: point.x, y: end.y },
                  end,
                ];
              }
            } else if (segmentIndex === 0 && orthogonalPoints.length >= 2) {
              const start = orthogonalPoints[0];
              const second = orthogonalPoints[1];
              if (start.x === second.x) {
                orthogonalPoints = [
                  start,
                  { x: point.x, y: start.y },
                  { x: point.x, y: second.y },
                  ...orthogonalPoints.slice(1),
                ];
              } else {
                orthogonalPoints = [
                  start,
                  { x: start.x, y: point.y },
                  { x: second.x, y: point.y },
                  ...orthogonalPoints.slice(1),
                ];
              }
            } else if (
              segmentIndex === lastSegmentIndex &&
              orthogonalPoints.length >= 2
            ) {
              const penultimate = orthogonalPoints[lastPointIndex - 1];
              const end = orthogonalPoints[lastPointIndex];
              if (penultimate.x === end.x) {
                orthogonalPoints = [
                  ...orthogonalPoints.slice(0, lastPointIndex),
                  { x: point.x, y: penultimate.y },
                  { x: point.x, y: end.y },
                  end,
                ];
              } else {
                orthogonalPoints = [
                  ...orthogonalPoints.slice(0, lastPointIndex),
                  { x: penultimate.x, y: point.y },
                  { x: end.x, y: point.y },
                  end,
                ];
              }
            } else {
              orthogonalPoints = moveOrthogonalSegment(
                orthogonalPoints,
                segmentIndex,
                point,
              );
            }

            newPoints = compressPath(orthogonalPoints);
          }
        }
      } else if (element.type === "text" && element.text && element.fontSize) {
        const weight =
          element.fontWeight ||
          (element.fontSize >= 36
            ? "800"
            : element.fontSize >= 26
              ? "700"
              : element.fontSize >= 20
                ? "600"
                : "400");

        const estimateTextSize = (size: number) => {
          const baseSize = size;
          let effectiveSize = baseSize;
          if (weight === "800") effectiveSize = Math.max(baseSize, 36);
          else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
          else if (weight === "600" && baseSize >= 20)
            effectiveSize = Math.max(baseSize, 20);

          const lines = element.text!.split("\n");
          const maxChars = Math.max(...lines.map((l) => l.length), 1);
          const width = maxChars * effectiveSize * 0.62 + 8;
          const lineHeight = effectiveSize * 1.2;
          const height = Math.max(
            effectiveSize,
            effectiveSize + Math.max(0, lines.length - 1) * lineHeight,
          );
          return { width, height };
        };

        const originalSize = estimateTextSize(element.fontSize);
        const left = element.points[0].x;
        const top = element.points[0].y;
        const right = left + originalSize.width;
        const bottom = top + originalSize.height;

        const hasEast = handle.includes("e");
        const hasWest = handle.includes("w");
        const hasNorth = handle.includes("n");
        const hasSouth = handle.includes("s");

        const scaleXFromEast = (point.x - left) / Math.max(1, originalSize.width);
        const scaleXFromWest = (right - point.x) / Math.max(1, originalSize.width);
        const scaleYFromNorth =
          (bottom - point.y) / Math.max(1, originalSize.height);
        const scaleYFromSouth =
          (point.y - top) / Math.max(1, originalSize.height);

        let scaleX = 1;
        let scaleY = 1;

        if (hasEast) scaleX = scaleXFromEast;
        if (hasWest) scaleX = scaleXFromWest;
        if (hasNorth) scaleY = scaleYFromNorth;
        if (hasSouth) scaleY = scaleYFromSouth;

        let scaleFactor = 1;
        if ((hasEast || hasWest) && (hasNorth || hasSouth)) {
          scaleFactor = Math.max(scaleX, scaleY);
        } else if (hasEast || hasWest) {
          scaleFactor = scaleX;
        } else if (hasNorth || hasSouth) {
          scaleFactor = scaleY;
        }

        scaleFactor = Math.max(0.25, Math.min(6, scaleFactor));
        newFontSize = Math.max(
          12,
          Math.min(200, Math.round(element.fontSize * scaleFactor)),
        );

        const resizedSize = estimateTextSize(newFontSize);
        let newX = element.points[0].x;
        let newY = element.points[0].y;

        // Keep opposite side anchored for north/west handles to prevent jumpy behavior.
        if (hasWest) {
          newX = right - resizedSize.width;
        }
        if (hasNorth) {
          newY = bottom - resizedSize.height;
        }

        newPoints[0] = { x: newX, y: newY };
      }

      const isArrowResize =
        isArrowElement(element) &&
        (handle === "start" ||
          handle === "end" ||
          handle.startsWith("segment-") ||
          handle.startsWith("bend-"));

      return {
        ...element,
        points: newPoints,
        fontSize: newFontSize,
        ...(isArrowResize
          ? {
              routingMode:
                handle.startsWith("segment-") || handle.startsWith("bend-")
                  ? "orthogonal"
                  : element.routingMode,
              isManuallyRouted:
                handle.startsWith("segment-") || handle.startsWith("bend-")
                  ? true
                  : element.isManuallyRouted,
            }
          : {}),
      };
    },
    [elements, getConnectionSide],
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

import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { useCallback, useEffect } from "react";

interface CanvasEngineProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  elements: DrawingElement[];
  currentElement: DrawingElement | null;
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;
  canvasSize: { width: number; height: number };
  selectedElements: string[];
  selectionBox?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null;
  editingTextId?: string | null;
  otherUsersDrafts?: DrawingElement[];
  otherUsersSelections?: Record<string, string>;
  onElementSelect: (elementId: string) => void;
  cursorPosition?: { x: number; y: number } | null;
  eraserSize?: number;
  currentTool?: string;
}

const useCanvasEngine = ({
  canvasRef,
  elements,
  currentElement,
  zoom,
  panOffset,
  showGrid,
  canvasSize,
  selectedElements,
  selectionBox,
  editingTextId,
  otherUsersDrafts = [],
  otherUsersSelections = {},
  onElementSelect,
  cursorPosition,
  eraserSize = 20,
  currentTool,
  getElementBounds,
}: CanvasEngineProps & {
  getElementBounds: (element: DrawingElement) => any;
}) => {
  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!showGrid) return;

      const gridSize = 20 * zoom;
      const majorGridSize = gridSize * 5;
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;

      // Start from the visible top-left corner
      const offsetX = panOffset.x % gridSize;
      const offsetY = panOffset.y % gridSize;

      for (let x = offsetX; x < width; x += gridSize) {
        for (let y = offsetY; y < height; y += gridSize) {
          const worldX = (x - panOffset.x) / zoom;
          const worldY = (y - panOffset.y) / zoom;

          // Check if it's a major grid point (every 100 world units)
          const isMajor =
            Math.abs(Math.round(worldX) % 100) < 1 &&
            Math.abs(Math.round(worldY) % 100) < 1;

          ctx.beginPath();
          if (isMajor) {
            ctx.fillStyle = "#cbd5e1"; // Darker for major
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          } else {
            ctx.fillStyle = "#e2e8f0"; // Lighter for minor
            ctx.arc(x, y, 1, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    },
    [showGrid, zoom, panOffset],
  );

  const drawElement = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      element: DrawingElement,
      isSelected = false,
    ) => {
      // Save context state
      ctx.save();

      ctx.strokeStyle = element.color;
      ctx.lineWidth = element.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = isSelected ? 1 : 1;

      if (element.fill) {
        ctx.fillStyle = element.fill;
      }

      switch (element.type) {
        case "freehand":
          if (element.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(
              element.points[0].x * zoom + panOffset.x,
              element.points[0].y * zoom + panOffset.y,
            );
            for (let i = 1; i < element.points.length; i++) {
              ctx.lineTo(
                element.points[i].x * zoom + panOffset.x,
                element.points[i].y * zoom + panOffset.y,
              );
            }
            ctx.stroke();
          }
          break;

        case "rectangle":
          if (element.points.length === 2) {
            const startX = element.points[0].x * zoom + panOffset.x;
            const startY = element.points[0].y * zoom + panOffset.y;
            const endX = element.points[1].x * zoom + panOffset.x;
            const endY = element.points[1].y * zoom + panOffset.y;

            const width = endX - startX;
            const height = endY - startY;

            if (element.fill) {
              ctx.fillRect(startX, startY, width, height);
            }
            ctx.strokeRect(startX, startY, width, height);
          }
          break;

        case "circle":
          if (element.points.length === 2) {
            const centerX = element.points[0].x * zoom + panOffset.x;
            const centerY = element.points[0].y * zoom + panOffset.y;
            const endX = element.points[1].x * zoom + panOffset.x;
            const endY = element.points[1].y * zoom + panOffset.y;

            const radius = Math.sqrt(
              Math.pow(endX - centerX, 2) + Math.pow(endY - centerY, 2),
            );

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            if (element.fill) {
              ctx.fill();
            }
            ctx.stroke();
          }
          break;

        case "line":
          if (element.points.length === 2) {
            ctx.beginPath();
            ctx.moveTo(
              element.points[0].x * zoom + panOffset.x,
              element.points[0].y * zoom + panOffset.y,
            );
            ctx.lineTo(
              element.points[1].x * zoom + panOffset.x,
              element.points[1].y * zoom + panOffset.y,
            );
            ctx.stroke();
          }
          break;

        case "arrow":
          if (element.points.length === 2) {
            const startX = element.points[0].x * zoom + panOffset.x;
            const startY = element.points[0].y * zoom + panOffset.y;
            const endX = element.points[1].x * zoom + panOffset.x;
            const endY = element.points[1].y * zoom + panOffset.y;

            // Draw line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw arrowhead
            const angle = Math.atan2(endY - startY, endX - startX);
            const arrowLength = 15;
            const arrowAngle = Math.PI / 6;

            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - arrowLength * Math.cos(angle - arrowAngle),
              endY - arrowLength * Math.sin(angle - arrowAngle),
            );
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - arrowLength * Math.cos(angle + arrowAngle),
              endY - arrowLength * Math.sin(angle + arrowAngle),
            );
            ctx.stroke();
          }
          break;

        case "text":
          if (
            element.text &&
            element.fontSize &&
            element.id !== editingTextId
          ) {
            ctx.textBaseline = "top";
            const weight =
              element.fontWeight ||
              (element.fontSize >= 36
                ? "800"
                : element.fontSize >= 26
                  ? "700"
                  : element.fontSize >= 20
                    ? "600"
                    : "400");
            const style = element.fontStyle || "normal";

            // Sync scaling logic with CanvasTextBlock
            const baseSize = element.fontSize;
            let effectiveSize = baseSize;
            if (weight === "800") effectiveSize = Math.max(baseSize, 36);
            else if (weight === "700") effectiveSize = Math.max(baseSize, 26);
            else if (weight === "600" && baseSize >= 20)
              effectiveSize = Math.max(baseSize, 20);

            // Enhanced font stack for premium look
            ctx.font = `${style} ${weight} ${effectiveSize * zoom}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
            ctx.fillStyle = element.color;

            const lines = element.text.split("\n");
            const lineHeight = effectiveSize * zoom * 1.2;
            const startX = element.points[0].x * zoom + panOffset.x;
            const startY = element.points[0].y * zoom + panOffset.y;

            lines.forEach((line, i) => {
              ctx.fillText(line, startX, startY + i * lineHeight);
            });
          }
          break;
      }

      // Draw selection box and resize handles
      if (isSelected) {
        const bounds = getElementBounds(element);
        if (bounds) {
          const { minX, minY, maxX, maxY } = bounds;

          // Reset any transformations and line styles
          ctx.restore();
          ctx.save();

          // Selection box
          ctx.strokeStyle = "#007bff";
          ctx.lineWidth = 1;

          if (element.type === "text") {
            // Text selection: Solid, ultra-thin, low-opacity (Eraser-style)
            ctx.setLineDash([]);
            ctx.strokeStyle = "rgba(0, 123, 255, 0.25)";
            ctx.lineWidth = 1;
            ctx.strokeRect(
              minX * zoom + panOffset.x - 4,
              minY * zoom + panOffset.y - 4,
              (maxX - minX) * zoom + 8,
              (maxY - minY) * zoom + 8,
            );
          } else if (element.type !== "line" && element.type !== "arrow") {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "#007bff";
            ctx.strokeRect(
              minX * zoom + panOffset.x - 5,
              minY * zoom + panOffset.y - 5,
              (maxX - minX) * zoom + 10,
              (maxY - minY) * zoom + 10,
            );
          } else if (element.points.length >= 2) {
            // For lines, just subtly highlight the segment itself
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(
              element.points[0].x * zoom + panOffset.x,
              element.points[0].y * zoom + panOffset.y,
            );
            ctx.lineTo(
              element.points[1].x * zoom + panOffset.x,
              element.points[1].y * zoom + panOffset.y,
            );
            ctx.lineWidth = (element.strokeWidth || 2) + 4;
            ctx.strokeStyle = "rgba(0, 123, 255, 0.3)";
            ctx.stroke();
          }

          // Resize handles
          ctx.setLineDash([]); // Reset line dash
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#007bff";
          ctx.lineWidth = 1.5;

          const handleSize = 8;
          let handles: { x: number; y: number }[] = [];

          if (element.type === "line" || element.type === "arrow") {
            // Lines and arrows only have 2 endpoints
            if (element.points.length >= 2) {
              handles = [
                {
                  x: element.points[0].x * zoom + panOffset.x,
                  y: element.points[0].y * zoom + panOffset.y,
                },
                {
                  x: element.points[1].x * zoom + panOffset.x,
                  y: element.points[1].y * zoom + panOffset.y,
                },
              ];
            }
          } else {
            // Full 8-point bounding box for other shapes
            handles = [
              { x: minX * zoom + panOffset.x, y: minY * zoom + panOffset.y }, // nw
              {
                x: ((minX + maxX) / 2) * zoom + panOffset.x,
                y: minY * zoom + panOffset.y,
              }, // n
              { x: maxX * zoom + panOffset.x, y: minY * zoom + panOffset.y }, // ne
              {
                x: maxX * zoom + panOffset.x,
                y: ((minY + maxY) / 2) * zoom + panOffset.y,
              }, // e
              { x: maxX * zoom + panOffset.x, y: maxY * zoom + panOffset.y }, // se
              {
                x: ((minX + maxX) / 2) * zoom + panOffset.x,
                y: maxY * zoom + panOffset.y,
              }, // s
              { x: minX * zoom + panOffset.x, y: maxY * zoom + panOffset.y }, // sw
              {
                x: minX * zoom + panOffset.x,
                y: ((minY + maxY) / 2) * zoom + panOffset.y,
              }, // w
            ];
          }

          // Text elements in Eraser don't have 8 resize handles — keep it clean
          if (element.type !== "text") {
            handles.forEach((h) => {
              ctx.beginPath();
              ctx.arc(h.x, h.y, handleSize / 1.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
      }

      // Restore context state
      ctx.restore();

      // Draw remote selection highlights *after* restoring so we don't mess up the shape's context,
      // but only if it's NOT selected locally (local selection takes visual priority)
      if (!isSelected && otherUsersSelections[element.id]) {
        const bounds = getElementBounds(element);
        if (bounds) {
          const { minX, minY, maxX, maxY } = bounds;
          ctx.save();
          ctx.strokeStyle = "rgba(255, 100, 100, 0.8)"; // red tint for remote
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(
            minX * zoom + panOffset.x - 5,
            minY * zoom + panOffset.y - 5,
            (maxX - minX) * zoom + 10,
            (maxY - minY) * zoom + 10,
          );
          ctx.restore();
        }
      }
    },
    [zoom, panOffset, getElementBounds, otherUsersSelections],
  );

  // Force re-render when selection changes
  const forceRender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Set scale at start of frame
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear canvas (using logical pixels)
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Draw grid
    drawGrid(ctx);

    // Draw all elements with selection state
    elements.forEach((element) => {
      const isSelected = selectedElements.includes(element.id);
      drawElement(ctx, element, isSelected);
    });

    // Draw current element
    if (currentElement) {
      drawElement(ctx, currentElement);
    }

    // Draw other users' active drafts
    otherUsersDrafts.forEach((draft) => {
      ctx.save();
      ctx.globalAlpha = 0.5; // Draw others' drafts semi-transparently
      drawElement(ctx, draft);
      ctx.restore();
    });

    // Draw eraser cursor if active
    if (currentTool === "eraser" && cursorPosition) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        cursorPosition.x * zoom + panOffset.x,
        cursorPosition.y * zoom + panOffset.y,
        (eraserSize * zoom) / 2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw selection box overlay
    if (selectionBox) {
      const { start, end } = selectionBox;
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);

      ctx.save();
      ctx.fillStyle = "rgba(0, 123, 255, 0.1)";
      ctx.strokeStyle = "rgba(0, 123, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.fillRect(
        minX * zoom + panOffset.x,
        minY * zoom + panOffset.y,
        (maxX - minX) * zoom,
        (maxY - minY) * zoom,
      );
      ctx.strokeRect(
        minX * zoom + panOffset.x,
        minY * zoom + panOffset.y,
        (maxX - minX) * zoom,
        (maxY - minY) * zoom,
      );
      ctx.restore();
    }
  }, [
    elements,
    currentElement,
    drawGrid,
    drawElement,
    selectedElements,
    otherUsersDrafts,
    selectionBox,
    zoom,
    panOffset,
    cursorPosition,
    eraserSize,
    currentTool,
  ]);

  // Render canvas
  useEffect(() => {
    forceRender();
  }, [forceRender, canvasSize]);

  // Force re-render when selection changes
  useEffect(() => {
    forceRender();
  }, [selectedElements, forceRender]);
};

export default useCanvasEngine;

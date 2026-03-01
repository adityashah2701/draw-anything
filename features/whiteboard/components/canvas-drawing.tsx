import { useCallback, useEffect } from "react";
import {
  drawGrid,
  drawElement,
  getConnectionHandles,
} from "../utils/canvas-render-utils";
import { DrawingElement, Point } from "../types/whiteboard.types";

interface ConnectionDraft {
  fromElementId: string;
  fromHandle: string;
  currentPoint: Point;
}

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
  cursorPosition?: { x: number; y: number } | null;
  eraserSize?: number;
  currentTool?: string;
  /** ID of the shape that shows connection port handles */
  hoveredElementId?: string | null;
  /** Active connection being dragged from a port */
  connectionDraft?: ConnectionDraft | null;
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
  cursorPosition,
  eraserSize = 20,
  currentTool,
  getElementBounds,
  hoveredElementId,
  connectionDraft,
}: CanvasEngineProps & {
  getElementBounds: (
    element: DrawingElement,
  ) => { minX: number; minY: number; maxX: number; maxY: number } | null;
}) => {
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
    drawGrid(ctx, showGrid, zoom, panOffset);

    // Construct render context mapping
    const renderCtx = {
      zoom,
      panOffset,
      getElementBounds,
      otherUsersSelections,
      editingTextId,
      hoveredElementId,
    };

    // Draw all elements with selection state
    elements.forEach((element) => {
      const isSelected = selectedElements.includes(element.id);
      drawElement(ctx, element, isSelected, renderCtx);
    });

    // Draw current element
    if (currentElement) {
      drawElement(ctx, currentElement, false, renderCtx);
    }

    // Draw other users' active drafts
    otherUsersDrafts.forEach((draft) => {
      ctx.save();
      ctx.globalAlpha = 0.5; // Draw others' drafts semi-transparently
      drawElement(ctx, draft, false, renderCtx);
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

    // ── Connection draft preview ─────────────────────────────────────────
    if (connectionDraft) {
      const fromEl = elements.find(
        (el) => el.id === connectionDraft.fromElementId,
      );
      if (fromEl) {
        const fromBounds = getElementBounds(fromEl);
        const fromHandles = getConnectionHandles(fromEl, fromBounds);
        const fromHandle = fromHandles.find(
          (h) => h.name === connectionDraft.fromHandle,
        );
        if (fromHandle) {
          const sx = fromHandle.x * zoom + panOffset.x;
          const sy = fromHandle.y * zoom + panOffset.y;
          const ex = connectionDraft.currentPoint.x * zoom + panOffset.x;
          const ey = connectionDraft.currentPoint.y * zoom + panOffset.y;

          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();

          // Arrowhead at cursor
          const angle = Math.atan2(ey - sy, ex - sx);
          const arrowLen = 12;
          ctx.setLineDash([]);
          ctx.fillStyle = "#38bdf8";
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(
            ex - arrowLen * Math.cos(angle - Math.PI / 6),
            ey - arrowLen * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(
            ex - arrowLen * Math.cos(angle + Math.PI / 6),
            ey - arrowLen * Math.sin(angle + Math.PI / 6),
          );
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }, [
    elements,
    currentElement,
    selectedElements,
    otherUsersDrafts,
    selectionBox,
    zoom,
    panOffset,
    cursorPosition,
    eraserSize,
    currentTool,
    canvasRef,
    editingTextId,
    getElementBounds,
    otherUsersSelections,
    showGrid,
    hoveredElementId,
    connectionDraft,
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

import { useCallback, useEffect, useRef } from "react";
import {
  drawGrid,
  drawElement,
  getConnectionHandles,
} from "../utils/canvas-render-utils";
import { DrawingElement, Point } from "../types/whiteboard.types";
import { routeArrowPoints } from "@/core/routing/orthogonal-router";
import { Anchor } from "@/features/whiteboard/types/whiteboard.types";

interface ConnectionDraft {
  fromElementId: string;
  fromAnchorId: string;
  fromHandle: string;
  currentPoint: Point;
}

interface MagneticSnapPreview {
  endpoint: "start" | "end";
  pointer: Point;
  anchor: Anchor;
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
  magneticSnapPreview?: MagneticSnapPreview | null;
  /** Shape label currently being edited inline */
  editingShapeLabelId?: string | null;
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
  magneticSnapPreview,
  editingShapeLabelId,
}: CanvasEngineProps & {
  getElementBounds: (
    element: DrawingElement,
  ) => { minX: number; minY: number; maxX: number; maxY: number } | null;
}) => {
  const rafRef = useRef<number | null>(null);

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

    const viewMinX = (-panOffset.x) / zoom;
    const viewMinY = (-panOffset.y) / zoom;
    const viewMaxX = viewMinX + canvasSize.width / zoom;
    const viewMaxY = viewMinY + canvasSize.height / zoom;
    const viewPadding = 120 / zoom;
    const isVisible = (element: DrawingElement) => {
      const b = getElementBounds(element);
      if (!b) return false;
      return !(
        b.maxX < viewMinX - viewPadding ||
        b.minX > viewMaxX + viewPadding ||
        b.maxY < viewMinY - viewPadding ||
        b.minY > viewMaxY + viewPadding
      );
    };

    // Draw all elements with selection state
    elements.forEach((element) => {
      if (!isVisible(element) && !selectedElements.includes(element.id)) {
        return;
      }
      const isSelected = selectedElements.includes(element.id);
      const renderElement =
        editingShapeLabelId &&
        element.id === editingShapeLabelId &&
        typeof element.label === "string"
          ? { ...element, label: undefined }
          : element;
      drawElement(ctx, renderElement, isSelected, renderCtx);
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
          const ex = connectionDraft.currentPoint.x * zoom + panOffset.x;
          const ey = connectionDraft.currentPoint.y * zoom + panOffset.y;

          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          const previewPath = routeArrowPoints({
            start: { x: fromHandle.x, y: fromHandle.y },
            end: connectionDraft.currentPoint,
            startHandle: fromHandle.name,
            routingMode: "orthogonal",
          });
          ctx.beginPath();
          ctx.moveTo(
            previewPath[0].x * zoom + panOffset.x,
            previewPath[0].y * zoom + panOffset.y,
          );
          for (let i = 1; i < previewPath.length; i += 1) {
            ctx.lineTo(
              previewPath[i].x * zoom + panOffset.x,
              previewPath[i].y * zoom + panOffset.y,
            );
          }
          ctx.stroke();

          // Arrowhead at cursor
          const prevPoint = previewPath[Math.max(0, previewPath.length - 2)];
          const angle = Math.atan2(
            ey - (prevPoint.y * zoom + panOffset.y),
            ex - (prevPoint.x * zoom + panOffset.x),
          );
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

    if (magneticSnapPreview) {
      const pointerX = magneticSnapPreview.pointer.x * zoom + panOffset.x;
      const pointerY = magneticSnapPreview.pointer.y * zoom + panOffset.y;
      const anchorX = magneticSnapPreview.anchor.x * zoom + panOffset.x;
      const anchorY = magneticSnapPreview.anchor.y * zoom + panOffset.y;
      const pulse = 1 + Math.sin(performance.now() / 120) * 0.12;

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY);
      ctx.lineTo(anchorX, anchorY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 10 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(14, 165, 233, 0.2)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 6 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#0ea5e9";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
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
    magneticSnapPreview,
    canvasSize,
    editingShapeLabelId,
  ]);

  // Render canvas
  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      forceRender();
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [forceRender]);
};

export default useCanvasEngine;

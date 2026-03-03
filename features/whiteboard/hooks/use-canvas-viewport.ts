import { useCallback, useEffect, useMemo, useState } from "react";
import { Point } from "@/features/whiteboard/types/whiteboard.types";

/** World-space axis-aligned bounding box of the current viewport. */
export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const useCanvasViewport = () => {
  // Canvas settings
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState<Point | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Initialize canvas size
  useEffect(() => {
    setCanvasSize({ width: window.innerWidth, height: window.innerHeight });

    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Viewport bounds in world space ──────────────────────────────────
  // Tells consumers which portion of world-space is currently visible.
  // Used for viewport-based virtualization (skip routing/rendering off-screen).
  const viewportBounds = useMemo<ViewportBounds>(() => {
    const { width, height } = canvasSize;
    // Convert screen-space rect to world-space coords
    const minX = -panOffset.x / zoom;
    const minY = -panOffset.y / zoom;
    const maxX = minX + width / zoom;
    const maxY = minY + height / zoom;
    return { minX, minY, maxX, maxY };
  }, [zoom, panOffset, canvasSize]);

  // Get mouse position relative to canvas
  const getMousePosition = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - panOffset.x) / zoom,
        y: (e.clientY - rect.top - panOffset.y) / zoom,
      };
    },
    [zoom, panOffset],
  );

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom around cursor position for precise navigation.
      const worldX = (mouseX - panOffset.x) / zoom;
      const worldY = (mouseY - panOffset.y) / zoom;

      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

      setZoom(nextZoom);
      setPanOffset({
        x: mouseX - worldX * nextZoom,
        y: mouseY - worldY * nextZoom,
      });
    },
    [zoom, panOffset],
  );

  // Zoom operations
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const fitToBounds = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);

      if (canvasSize.width <= 0 || canvasSize.height <= 0) return;

      const padding = 80;
      const fitZoomX = (canvasSize.width - padding * 2) / width;
      const fitZoomY = (canvasSize.height - padding * 2) / height;
      const nextZoom = Math.max(0.1, Math.min(5, Math.min(fitZoomX, fitZoomY)));

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;

      setZoom(nextZoom);
      setPanOffset({
        x: canvasSize.width / 2 - centerX * nextZoom,
        y: canvasSize.height / 2 - centerY * nextZoom,
      });
    },
    [canvasSize],
  );

  // Pan operations
  const startPanning = useCallback((point: Point) => {
    setStartPan(point);
  }, []);

  const handlePan = useCallback(
    (currentPoint: Point) => {
      if (startPan) {
        setPanOffset({
          x: panOffset.x + (currentPoint.x - startPan.x) * zoom,
          y: panOffset.y + (currentPoint.y - startPan.y) * zoom,
        });
      }
    },
    [startPan, panOffset, zoom],
  );

  const stopPanning = useCallback(() => {
    setStartPan(null);
  }, []);

  // Grid toggle
  const toggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev);
  }, []);

  // Load viewport settings
  const loadViewportSettings = useCallback(
    (settings: {
      zoom?: number;
      panOffset?: { x: number; y: number };
      showGrid?: boolean;
    }) => {
      if (settings.zoom !== undefined) setZoom(settings.zoom);
      if (settings.panOffset) setPanOffset(settings.panOffset);
      if (settings.showGrid !== undefined) setShowGrid(settings.showGrid);
    },
    [],
  );

  return {
    // State
    zoom,
    panOffset,
    startPan,
    showGrid,
    canvasSize,

    // Viewport-based virtualization boundary (world-space)
    viewportBounds,

    // Actions
    setZoom,
    setPanOffset,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    fitToBounds,
    handleWheelZoom,
    startPanning,
    handlePan,
    stopPanning,
    toggleGrid,
    getMousePosition,
    loadViewportSettings,

    // Utils
    isPanning: startPan !== null,
  };
};

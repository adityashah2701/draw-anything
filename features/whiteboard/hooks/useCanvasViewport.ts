import { useCallback, useEffect, useState } from "react";
import { Point } from "@/features/whiteboard/types/whiteboard.types";

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
    [zoom, panOffset]
  );

  // Zoom operations
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

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
    [startPan, panOffset, zoom]
  );

  const stopPanning = useCallback(() => {
    setStartPan(null);
  }, []);

  // Grid toggle
  const toggleGrid = useCallback(() => {
    setShowGrid(prev => !prev);
  }, []);

  // Load viewport settings
  const loadViewportSettings = useCallback((settings: {
    zoom?: number;
    panOffset?: { x: number; y: number };
    showGrid?: boolean;
  }) => {
    if (settings.zoom !== undefined) setZoom(settings.zoom);
    if (settings.panOffset) setPanOffset(settings.panOffset);
    if (settings.showGrid !== undefined) setShowGrid(settings.showGrid);
  }, []);

  return {
    // State
    zoom,
    panOffset,
    startPan,
    showGrid,
    canvasSize,
    
    // Actions
    setZoom,
    setPanOffset,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { clampZoom, fitView, pinchView, stepZoom, wheelIntent, zoomAtPoint, type Pair, type View } from "@/features/whiteboard/utils/viewport-math";

/** World-space axis-aligned bounding box of the current viewport. */
export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const useCanvasViewport = () => {
  // Zoom and pan change together (zooming moves the pan), so they are one state: no render can
  // see a new zoom with the old pan.
  const [view, setView] = useState<View>({ zoom: 1, panOffset: { x: 0, y: 0 } });
  const { zoom, panOffset } = view;
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
    const minX = -panOffset.x / zoom;
    const minY = -panOffset.y / zoom;
    return { minX, minY, maxX: minX + width / zoom, maxY: minY + height / zoom };
  }, [zoom, panOffset, canvasSize]);

  // Get mouse position relative to canvas
  const getMousePosition = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - panOffset.x) / zoom,
        y: (e.clientY - rect.top - panOffset.y) / zoom,
      };
    },
    [zoom, panOffset],
  );

  /**
   * Wheel on the canvas. Attach it natively with `{ passive: false }`: React's `onWheel` is passive,
   * so `preventDefault` there is ignored and Ctrl+wheel would zoom the whole browser page.
   */
  const handleNativeWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const intent = wheelIntent(e);
    setView((current) =>
      intent.kind === "zoom"
        ? zoomAtPoint(current, { x: e.clientX - rect.left, y: e.clientY - rect.top }, current.zoom * intent.factor)
        : { ...current, panOffset: { x: current.panOffset.x + intent.dx, y: current.panOffset.y + intent.dy } },
    );
  }, []);

  /** Two-finger zoom and pan; see `pinchView`. */
  const pinchTo = useCallback((from: Pair, to: Pair) => setView((v) => pinchView(v, from, to)), []);

  // Buttons and Ctrl +/-: zoom about the middle of the canvas, like the wheel zooms about the cursor.
  const handleZoomIn = useCallback(() => setView((v) => stepZoom(v, canvasSize, 1)), [canvasSize]);
  const handleZoomOut = useCallback(() => setView((v) => stepZoom(v, canvasSize, -1)), [canvasSize]);
  const handleResetZoom = useCallback(() => setView({ zoom: 1, panOffset: { x: 0, y: 0 } }), []);

  const fitToBounds = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const next = fitView(bounds, canvasSize);
      if (next) setView(next);
    },
    [canvasSize],
  );

  /** Moves the view so a world point sits at the middle of the canvas (minimap clicks). */
  const centerOn = useCallback(
    (world: Point) =>
      setView((v) => ({
        ...v,
        panOffset: { x: canvasSize.width / 2 - world.x * v.zoom, y: canvasSize.height / 2 - world.y * v.zoom },
      })),
    [canvasSize],
  );

  // Pan operations
  const startPanning = useCallback((point: Point) => {
    setStartPan(point);
  }, []);

  // Not a functional update on purpose: `currentPoint` is a world point computed from the pan of the
  // render that produced it, so it must be applied to that same pan (else two moves between renders
  // would apply the same displacement twice).
  const handlePan = useCallback(
    (currentPoint: Point) => {
      if (!startPan) return;
      setView({
        zoom,
        panOffset: {
          x: panOffset.x + (currentPoint.x - startPan.x) * zoom,
          y: panOffset.y + (currentPoint.y - startPan.y) * zoom,
        },
      });
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
      setView((v) => ({
        zoom: settings.zoom !== undefined && Number.isFinite(settings.zoom) ? clampZoom(settings.zoom) : v.zoom,
        panOffset:
          settings.panOffset && Number.isFinite(settings.panOffset.x) && Number.isFinite(settings.panOffset.y)
            ? settings.panOffset
            : v.panOffset,
      }));
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
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    fitToBounds,
    centerOn,
    handleNativeWheel,
    pinchTo,
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

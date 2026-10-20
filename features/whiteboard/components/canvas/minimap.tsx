import { useEffect, useMemo, useRef } from "react";
import type { DrawingElement, Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { minimapTransform, toMinimap, toWorld, type Box } from "@/features/whiteboard/utils/minimap-math";

const WIDTH = 168;
const HEIGHT = 112;
/** Past this many shapes the minimap draws a sample, so it never costs more than a frame. */
const MAX_DRAWN = 1500;

interface MinimapProps {
  elements: DrawingElement[];
  getElementBounds: (element: DrawingElement) => Bounds | null;
  zoom: number;
  panOffset: { x: number; y: number };
  canvasSize: { width: number; height: number };
  onCenter: (world: { x: number; y: number }) => void;
}

export const Minimap = ({ elements, getElementBounds, zoom, panOffset, canvasSize, onCenter }: MinimapProps) => {
  const ref = useRef<HTMLCanvasElement>(null);

  // Shape rectangles only change with the elements, not on every pan frame.
  const frameRects = useMemo(
    () => elements.flatMap((el) => (el.type === "frame" ? (getElementBounds(el) ?? []) : [])),
    [elements, getElementBounds],
  );
  const rects = useMemo(() => {
    const out: Box[] = [];
    const step = Math.max(1, Math.ceil(elements.length / MAX_DRAWN));
    for (let i = 0; i < elements.length; i += step) {
      const el = elements[i];
      if (el.isGuide || el.type === "frame") continue;
      const b = getElementBounds(el);
      if (b) out.push(b);
    }
    return out;
  }, [elements, getElementBounds]);

  const content = useMemo<Box | null>(() => {
    const all = [...rects, ...frameRects];
    if (all.length === 0) return null;
    return {
      minX: Math.min(...all.map((r) => r.minX)),
      minY: Math.min(...all.map((r) => r.minY)),
      maxX: Math.max(...all.map((r) => r.maxX)),
      maxY: Math.max(...all.map((r) => r.maxY)),
    };
  }, [rects, frameRects]);

  const viewport: Box = useMemo(
    () => ({
      minX: -panOffset.x / zoom,
      minY: -panOffset.y / zoom,
      maxX: (canvasSize.width - panOffset.x) / zoom,
      maxY: (canvasSize.height - panOffset.y) / zoom,
    }),
    [zoom, panOffset, canvasSize],
  );
  const transform = useMemo(() => minimapTransform(content, viewport, { width: WIDTH, height: HEIGHT }), [content, viewport]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(100, 116, 139, 0.55)";
    for (const r of rects) {
      const a = toMinimap(transform, { x: r.minX, y: r.minY });
      ctx.fillRect(a.x, a.y, Math.max(1.5, (r.maxX - r.minX) * transform.scale), Math.max(1.5, (r.maxY - r.minY) * transform.scale));
    }
    // Frames are outlines, so the shapes inside them stay readable.
    ctx.strokeStyle = "rgba(100, 116, 139, 0.55)";
    ctx.lineWidth = 1;
    for (const r of frameRects) {
      const a = toMinimap(transform, { x: r.minX, y: r.minY });
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, Math.max(1.5, (r.maxX - r.minX) * transform.scale), Math.max(1.5, (r.maxY - r.minY) * transform.scale));
    }
    const v = toMinimap(transform, { x: viewport.minX, y: viewport.minY });
    ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
    ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
    ctx.lineWidth = 1.5;
    const w = (viewport.maxX - viewport.minX) * transform.scale;
    const h = (viewport.maxY - viewport.minY) * transform.scale;
    ctx.fillRect(v.x, v.y, w, h);
    ctx.strokeRect(v.x, v.y, w, h);
  }, [rects, frameRects, transform, viewport]);

  const centerFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onCenter(toWorld(transform, { x: e.clientX - box.left, y: e.clientY - box.top }));
  };

  return (
    <div className="absolute bottom-4 right-4 z-30 overflow-hidden rounded-lg border border-border bg-popover shadow-float">
      <canvas
        ref={ref}
        aria-label="Minimap: click or drag to move the view"
        role="img"
        style={{ width: WIDTH, height: HEIGHT, display: "block", cursor: "pointer", touchAction: "none" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          centerFrom(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) centerFrom(e);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      />
    </div>
  );
};

export default Minimap;

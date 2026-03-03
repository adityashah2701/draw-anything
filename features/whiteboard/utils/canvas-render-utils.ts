import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  getArrowEditHandles,
  isArrowElement,
} from "@/core/shapes/arrow/arrow-utils";
import { ConnectionHandle } from "@/core/routing/connection-handles";
import {
  getShapeAnchors,
  renderShapeToCanvas,
} from "@/core/shapes/shape-runtime";

export interface RenderContext {
  zoom: number;
  panOffset: { x: number; y: number };
  getElementBounds: (
    element: DrawingElement,
  ) => { minX: number; minY: number; maxX: number; maxY: number } | null;
  otherUsersSelections?: Record<string, string>;
  editingTextId?: string | null;
  /** ID of element whose connection handles should be rendered */
  hoveredElementId?: string | null;
}

/** Returns the 4 edge-midpoint connection handles for shape nodes in world coords */
export const getConnectionHandles = (
  element: DrawingElement,
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
): { id: string; name: ConnectionHandle; x: number; y: number }[] => {
  const shapeBounds = bounds
    ? {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      }
    : null;
  return getShapeAnchors(element, shapeBounds).map((anchor) => ({
    id: anchor.id,
    name: anchor.side,
    x: anchor.x,
    y: anchor.y,
  }));
};

export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  showGrid: boolean,
  zoom: number,
  panOffset: { x: number; y: number },
) => {
  if (!showGrid) return;

  const gridSize = 20 * zoom;
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
};

/** Helper: draw a centered label inside a shape region */
const drawShapeLabel = (
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  clipPath: () => void,
  zoom: number,
  color: string,
  maxWidth: number,
  maxHeight: number,
  preferredFontSize?: number,
  preferredFontWeight?: string | number,
  preferredFontStyle?: string,
) => {
  const baseWeight =
    (preferredFontWeight?.toString() as string) ||
    (preferredFontSize && preferredFontSize >= 20 ? "600" : "500");
  const baseStyle = preferredFontStyle === "italic" ? "italic" : "normal";

  const measureWithFont = (fontSize: number, text: string) => {
    ctx.font = `${baseStyle} ${baseWeight} ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    return ctx.measureText(text).width;
  };

  const buildLines = (text: string, fontSize: number, width: number) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const splitLongWord = (word: string) => {
      if (measureWithFont(fontSize, word) <= width) return [word];
      const chunks: string[] = [];
      let current = "";
      for (const ch of word) {
        const candidate = current + ch;
        if (current && measureWithFont(fontSize, candidate) > width) {
          chunks.push(current);
          current = ch;
        } else {
          current = candidate;
        }
      }
      if (current) chunks.push(current);
      return chunks;
    };

    const normalizedWords = words.flatMap((w) => splitLongWord(w));
    const lines: string[] = [];
    let current = normalizedWords[0];

    for (let i = 1; i < normalizedWords.length; i += 1) {
      const candidate = `${current} ${normalizedWords[i]}`;
      if (measureWithFont(fontSize, candidate) <= width) {
        current = candidate;
      } else {
        lines.push(current);
        current = normalizedWords[i];
      }
    }
    lines.push(current);

    return lines;
  };

  const availableWidth = Math.max(24, maxWidth);
  const availableHeight = Math.max(16, maxHeight);
  const maxLines = 3;

  const targetSize = (preferredFontSize || 14) * zoom;
  let fittedSize = Math.max(9, Math.min(targetSize, 64));
  let fittedLines = [label];

  for (let size = fittedSize; size >= 9; size -= 1) {
    const lines = buildLines(label, size, availableWidth);
    if (lines.length > maxLines) continue;
    const widestLine = Math.max(
      ...lines.map((line) => measureWithFont(size, line || "")),
      0,
    );
    if (widestLine > availableWidth) continue;

    const lineHeight = size * 1.2;
    if (lines.length * lineHeight <= availableHeight) {
      fittedSize = size;
      fittedLines = lines;
      break;
    }
  }

  if (fittedLines.length > maxLines) {
    fittedLines = fittedLines.slice(0, maxLines);
    const last = fittedLines[maxLines - 1];
    fittedLines[maxLines - 1] =
      last.length > 1 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : "…";
  }

  ctx.save();
  clipPath();
  ctx.clip();
  ctx.font = `${baseStyle} ${baseWeight} ${fittedSize}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillStyle = color || "#1e293b";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const lineHeight = fittedSize * 1.2;
  const blockHeight = fittedLines.length * lineHeight;
  let y = cy - blockHeight / 2;

  for (const line of fittedLines) {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  }

  ctx.restore();
};

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: DrawingElement,
  isSelected: boolean,
  context: RenderContext,
) => {
  const {
    zoom,
    panOffset,
    getElementBounds,
    otherUsersSelections,
    editingTextId,
    hoveredElementId,
  } = context;

  // Save context state
  ctx.save();

  ctx.strokeStyle = element.color || "#000000";
  ctx.lineWidth = element.strokeWidth || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = isSelected ? 1 : 1;

  if (element.fill) {
    ctx.fillStyle = element.fill;
  }

  renderShapeToCanvas(element, {
    ctx,
    zoom,
    panOffset,
    getElementBounds,
    editingTextId,
  });

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
        const pad = 1;
        ctx.strokeRect(
          minX * zoom + panOffset.x - pad,
          minY * zoom + panOffset.y - pad,
          (maxX - minX) * zoom + pad * 2,
          (maxY - minY) * zoom + pad * 2,
        );
      } else if (
        element.type !== "line" &&
        element.type !== "arrow" &&
        element.type !== "arrow-bidirectional"
      ) {
        const padding = (element.strokeWidth || 2) / 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#007bff";
        ctx.strokeRect(
          (minX - padding) * zoom + panOffset.x - 5,
          (minY - padding) * zoom + panOffset.y - 5,
          (maxX - minX + padding * 2) * zoom + 10,
          (maxY - minY + padding * 2) * zoom + 10,
        );
      } else if (element.points.length >= 2) {
        // For lines, just subtly highlight the segment itself
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(
          element.points[0].x * zoom + panOffset.x,
          element.points[0].y * zoom + panOffset.y,
        );
        const endIndex = element.points.length - 1;
        if (
          element.type === "arrow" ||
          element.type === "arrow-bidirectional"
        ) {
          for (let i = 1; i <= endIndex; i += 1) {
            ctx.lineTo(
              element.points[i].x * zoom + panOffset.x,
              element.points[i].y * zoom + panOffset.y,
            );
          }
        } else {
          ctx.lineTo(
            element.points[1].x * zoom + panOffset.x,
            element.points[1].y * zoom + panOffset.y,
          );
        }
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

      if (element.type === "line") {
        // Lines and arrows only have endpoints (and optionally midpoints)
        if (element.points.length >= 2) {
          const endIndex = element.points.length - 1;

          handles = [
            {
              x: element.points[0].x * zoom + panOffset.x,
              y: element.points[0].y * zoom + panOffset.y,
            },
            {
              x: element.points[endIndex].x * zoom + panOffset.x,
              y: element.points[endIndex].y * zoom + panOffset.y,
            },
          ];
        }
      } else if (isArrowElement(element)) {
        const arrowHandles = getArrowEditHandles(element.points);
        arrowHandles.forEach((handle) => {
          const x = handle.point.x * zoom + panOffset.x;
          const y = handle.point.y * zoom + panOffset.y;

          if (handle.kind === "segment") {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.rect(-4, -4, 8, 8);
            ctx.fillStyle = "#dbeafe";
            ctx.strokeStyle = "#3b82f6";
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            return;
          }

          if (handle.kind === "bend") {
            ctx.beginPath();
            ctx.rect(x - 4, y - 4, 8, 8);
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#2563eb";
            ctx.fill();
            ctx.stroke();
            return;
          }

          handles.push({ x, y });
        });
      } else {
        const padding = (element.strokeWidth || 2) / 2;
        const pMinX = minX - padding;
        const pMinY = minY - padding;
        const pMaxX = maxX + padding;
        const pMaxY = maxY + padding;

        // Full 8-point bounding box for other shapes
        handles = [
          { x: pMinX * zoom + panOffset.x, y: pMinY * zoom + panOffset.y }, // nw
          {
            x: ((pMinX + pMaxX) / 2) * zoom + panOffset.x,
            y: pMinY * zoom + panOffset.y,
          }, // n
          { x: pMaxX * zoom + panOffset.x, y: pMinY * zoom + panOffset.y }, // ne
          {
            x: pMaxX * zoom + panOffset.x,
            y: ((pMinY + pMaxY) / 2) * zoom + panOffset.y,
          }, // e
          { x: pMaxX * zoom + panOffset.x, y: pMaxY * zoom + panOffset.y }, // se
          {
            x: ((pMinX + pMaxX) / 2) * zoom + panOffset.x,
            y: pMaxY * zoom + panOffset.y,
          }, // s
          { x: pMinX * zoom + panOffset.x, y: pMaxY * zoom + panOffset.y }, // sw
          {
            x: pMinX * zoom + panOffset.x,
            y: ((pMinY + pMaxY) / 2) * zoom + panOffset.y,
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
  if (!isSelected && otherUsersSelections && otherUsersSelections[element.id]) {
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

  // ── Connection handles (shown when this shape is hovered) ─────────────────
  if (hoveredElementId === element.id) {
    const bounds = getElementBounds(element);
    const handles = getConnectionHandles(element, bounds);
    handles.forEach((h) => {
      const sx = h.x * zoom + panOffset.x;
      const sy = h.y * zoom + panOffset.y;
      ctx.save();
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
      ctx.fill();
      // Inner handle
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });
  }
};

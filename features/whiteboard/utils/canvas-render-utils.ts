import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

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
): { name: string; x: number; y: number }[] => {
  if (!bounds) return [];
  if (
    element.type !== "rectangle" &&
    element.type !== "circle" &&
    element.type !== "diamond"
  ) {
    return [];
  }
  const { minX, minY, maxX, maxY } = bounds;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return [
    { name: "top", x: cx, y: minY },
    { name: "right", x: maxX, y: cy },
    { name: "bottom", x: cx, y: maxY },
    { name: "left", x: minX, y: cy },
  ];
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
  const baseStyle =
    preferredFontStyle === "italic" ? "italic" : "normal";

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

        // Draw embedded label centered inside the rect
        if (element.label) {
          const cx = startX + width / 2;
          const cy = startY + height / 2;
          drawShapeLabel(
            ctx,
            element.label,
            cx,
            cy,
            () => {
              ctx.beginPath();
              ctx.rect(startX + 4, startY + 4, width - 8, height - 8);
            },
            zoom,
            element.color,
            Math.max(20, Math.abs(width) - 16),
            Math.max(14, Math.abs(height) - 12),
            element.fontSize,
            element.fontWeight,
            element.fontStyle,
          );
        }
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

        // Draw embedded label centered inside the circle
        if (element.label) {
          drawShapeLabel(
            ctx,
            element.label,
            centerX,
            centerY,
            () => {
              ctx.beginPath();
              ctx.arc(centerX, centerY, radius * 0.85, 0, Math.PI * 2);
            },
            zoom,
            element.color,
            Math.max(20, radius * 1.32),
            Math.max(14, radius * 1.25),
            element.fontSize,
            element.fontWeight,
            element.fontStyle,
          );
        }
      }
      break;

    case "diamond":
      if (element.points.length === 2) {
        const startX = element.points[0].x * zoom + panOffset.x;
        const startY = element.points[0].y * zoom + panOffset.y;
        const endX = element.points[1].x * zoom + panOffset.x;
        const endY = element.points[1].y * zoom + panOffset.y;

        const left = Math.min(startX, endX);
        const right = Math.max(startX, endX);
        const top = Math.min(startY, endY);
        const bottom = Math.max(startY, endY);
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;

        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(right, cy);
        ctx.lineTo(cx, bottom);
        ctx.lineTo(left, cy);
        ctx.closePath();

        if (element.fill) {
          ctx.fill();
        }
        ctx.stroke();

        if (element.label) {
          drawShapeLabel(
            ctx,
            element.label,
            cx,
            cy,
            () => {
              ctx.beginPath();
              ctx.moveTo(cx, top + 6);
              ctx.lineTo(right - 6, cy);
              ctx.lineTo(cx, bottom - 6);
              ctx.lineTo(left + 6, cy);
              ctx.closePath();
            },
            zoom,
            element.color,
            Math.max(20, (right - left) * 0.62),
            Math.max(14, (bottom - top) * 0.62),
            element.fontSize,
            element.fontWeight,
            element.fontStyle,
          );
        }
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
      if (element.points.length >= 2) {
        const transformed = element.points.map((p) => ({
          x: p.x * zoom + panOffset.x,
          y: p.y * zoom + panOffset.y,
        }));

        // Draw routed polyline.
        ctx.beginPath();
        ctx.moveTo(transformed[0].x, transformed[0].y);
        for (let i = 1; i < transformed.length; i++) {
          ctx.lineTo(transformed[i].x, transformed[i].y);
        }
        ctx.stroke();

        // Arrowhead follows the direction of the final segment.
        const end = transformed[transformed.length - 1];
        let prev = transformed[transformed.length - 2];
        for (let i = transformed.length - 2; i >= 0; i -= 1) {
          if (
            transformed[i].x !== end.x ||
            transformed[i].y !== end.y
          ) {
            prev = transformed[i];
            break;
          }
        }

        const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - arrowLength * Math.cos(angle - arrowAngle),
          end.y - arrowLength * Math.sin(angle - arrowAngle),
        );
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - arrowLength * Math.cos(angle + arrowAngle),
          end.y - arrowLength * Math.sin(angle + arrowAngle),
        );
        ctx.stroke();
      }
      break;

    case "text":
      if (element.text && element.fontSize && element.id !== editingTextId) {
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
        ctx.fillStyle = element.color || "#000000";

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
        const pad = 1;
        ctx.strokeRect(
          minX * zoom + panOffset.x - pad,
          minY * zoom + panOffset.y - pad,
          (maxX - minX) * zoom + pad * 2,
          (maxY - minY) * zoom + pad * 2,
        );
      } else if (element.type !== "line" && element.type !== "arrow") {
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
        if (element.type === "arrow") {
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

      if (element.type === "line" || element.type === "arrow") {
        // Lines and arrows only have 2 endpoints
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
  if (
    hoveredElementId === element.id &&
    (element.type === "rectangle" ||
      element.type === "circle" ||
      element.type === "diamond")
  ) {
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

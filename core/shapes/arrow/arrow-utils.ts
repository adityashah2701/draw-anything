import { getAdaptiveColor } from '@/features/whiteboard/utils/canvas-render-utils';
import {
  ArrowConnection,
  ArrowStyle,
  ArrowShape,
  BidirectionalArrowShape,
  ConnectionHandle,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { parseAnchorSide } from "@/core/anchors/anchor-geometry";

export type ArrowElement = ArrowShape | BidirectionalArrowShape;

export interface ArrowEditHandle {
  name: string;
  kind: "start" | "end" | "bend" | "segment";
  point: Point;
}

export const isArrowElement = (
  element: DrawingElement,
): element is ArrowElement =>
  element.type === "arrow" || element.type === "arrow-bidirectional";

export const getArrowEditHandles = (points: Point[]): ArrowEditHandle[] => {
  if (points.length < 2) return [];

  const handles: ArrowEditHandle[] = [
    { name: "start", kind: "start", point: points[0] },
    {
      name: "end",
      kind: "end",
      point: points[points.length - 1],
    },
  ];

  for (let i = 1; i < points.length - 1; i += 1) {
    handles.push({
      name: `bend-${i}`,
      kind: "bend",
      point: points[i],
    });
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    handles.push({
      name: `segment-${i}`,
      kind: "segment",
      point: {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
      },
    });
  }

  return handles;
};

export const getArrowStyle = (element: ArrowElement): ArrowStyle => {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const color = getAdaptiveColor(element.color, isDark);

  return {
    strokeWidth: element.strokeWidth || 2,
    color,
    dashed: element.dashed,
    arrowHeadStart: element.arrowHeadStart,
    arrowHeadEnd: element.arrowHeadEnd,
  };
};

export const getArrowHeadVisibility = (
  element: ArrowElement,
): { start: boolean; end: boolean } => {
  const defaultStart = element.type === "arrow-bidirectional";
  const defaultEnd = true;

  return {
    start: element.arrowHeadStart ?? defaultStart,
    end: element.arrowHeadEnd ?? defaultEnd,
  };
};

export const drawArrow = (
  ctx: CanvasRenderingContext2D,
  element: ArrowElement,
  zoom: number,
  panOffset: { x: number; y: number },
) => {
  if (element.points.length < 2) return;

  const transformed = element.points.map((point) => ({
    x: point.x * zoom + panOffset.x,
    y: point.y * zoom + panOffset.y,
  }));

  const style = getArrowStyle(element);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(style.dashed ? [10 * zoom, 8 * zoom] : []);

  ctx.beginPath();
  ctx.moveTo(transformed[0].x, transformed[0].y);
  for (let i = 1; i < transformed.length; i += 1) {
    ctx.lineTo(transformed[i].x, transformed[i].y);
  }
  ctx.stroke();

  const heads = getArrowHeadVisibility(element);
  ctx.setLineDash([]);
  if (heads.end) {
    drawArrowhead(ctx, element, transformed, "end");
  }
  if (heads.start) {
    drawArrowhead(ctx, element, transformed, "start");
  }
};

const getConnectionHandle = (
  connection?: ArrowConnection,
): ConnectionHandle | null => {
  if (!connection) return null;
  if (connection.handle) return connection.handle;
  if (connection.anchorId) {
    return parseAnchorSide(connection.anchorId);
  }
  return null;
};

const getHandleDirection = (handle: ConnectionHandle): Point => {
  switch (handle) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
};

const normalize = (vector: Point): Point | null => {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 0.001) {
    return null;
  }
  return { x: vector.x / length, y: vector.y / length };
};

const MIN_ARROWHEAD_SEGMENT_LENGTH = 4;

const getMeaningfulArrowSegment = (
  points: Point[],
  position: "start" | "end",
): [Point | null, Point | null] => {
  if (points.length < 2) return [null, null];

  if (position === "end") {
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const from = points[i];
      const to = points[i + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length >= MIN_ARROWHEAD_SEGMENT_LENGTH) {
        return [from, to];
      }
    }
    return getArrowheadLine(points, position);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length >= MIN_ARROWHEAD_SEGMENT_LENGTH) {
      return [to, from];
    }
  }
  return getArrowheadLine(points, position);
};

const getArrowHeadDirection = (
  element: ArrowElement,
  points: Point[],
  position: "start" | "end",
): Point | null => {
  const [from, to] = getMeaningfulArrowSegment(points, position);
  if (!from || !to) return null;
  const direction = normalize({ x: to.x - from.x, y: to.y - from.y });
  if (direction) return direction;

  const connection =
    position === "end" ? element.endConnection : element.startConnection;
  const handle = getConnectionHandle(connection);
  if (!handle) return null;

  const outward = getHandleDirection(handle);
  return position === "end"
    ? { x: -outward.x, y: -outward.y }
    : outward;
};

const drawArrowhead = (
  ctx: CanvasRenderingContext2D,
  element: ArrowElement,
  points: Point[],
  position: "start" | "end",
) => {
  const tip =
    position === "end" ? points[points.length - 1] : points[0];
  const direction = getArrowHeadDirection(element, points, position);
  if (!tip || !direction) return;

  const length = 12;
  const width = 7;
  const baseX = tip.x - direction.x * length;
  const baseY = tip.y - direction.y * length;
  const perpX = -direction.y * width;
  const perpY = direction.x * width;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(baseX + perpX, baseY + perpY);
  ctx.lineTo(baseX - perpX, baseY - perpY);
  ctx.closePath();
  ctx.fillStyle = getArrowStyle(element).color;
  ctx.fill();
};

const getArrowheadLine = (
  points: Point[],
  position: "start" | "end",
): [Point | null, Point | null] => {
  if (points.length < 2) return [null, null];

  if (position === "end") {
    const tip = points[points.length - 1];
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const from = points[i];
      if (from.x !== tip.x || from.y !== tip.y) {
        return [from, tip];
      }
    }
    return [null, null];
  }

  const tip = points[0];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i];
    if (from.x !== tip.x || from.y !== tip.y) {
      return [from, tip];
    }
  }
  return [null, null];
};

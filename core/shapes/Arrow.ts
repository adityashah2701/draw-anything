import {
  ArrowStyle,
  ArrowType,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";

export interface ArrowElement extends DrawingElement {
  type: ArrowType;
}

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

export const getArrowStyle = (element: ArrowElement): ArrowStyle => ({
  strokeWidth: element.strokeWidth || 2,
  color: element.color || "#000000",
  dashed: element.dashed,
  arrowHeadStart: element.arrowHeadStart,
  arrowHeadEnd: element.arrowHeadEnd,
});

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
    drawArrowhead(ctx, transformed, "end");
  }
  if (heads.start) {
    drawArrowhead(ctx, transformed, "start");
  }
};

const drawArrowhead = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  position: "start" | "end",
) => {
  const [from, to] = getArrowheadLine(points, position);
  if (!from || !to) return;

  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = 14;
  const spread = Math.PI / 7;

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - length * Math.cos(angle - spread),
    to.y - length * Math.sin(angle - spread),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - length * Math.cos(angle + spread),
    to.y - length * Math.sin(angle + spread),
  );
  ctx.stroke();
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

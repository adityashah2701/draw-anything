import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";

/** Distance (world units) from the viewport's top-left corner at which a placed diagram starts. */
const VIEWPORT_MARGIN = 80;

export interface ViewportLike {
  zoom: number;
  panOffset: Point;
}

/** Top-left corner of everything in `elements`; Infinity on both axes when there are no points. */
export const cornerOf = (elements: readonly DrawingElement[]): Point => {
  let x = Infinity;
  let y = Infinity;
  for (const element of elements) {
    for (const point of element.points) {
      x = Math.min(x, point.x);
      y = Math.min(y, point.y);
    }
  }
  return { x, y };
};

const viewportCorner = ({ zoom, panOffset }: ViewportLike): Point => ({
  x: -panOffset.x / zoom + VIEWPORT_MARGIN,
  y: -panOffset.y / zoom + VIEWPORT_MARGIN,
});

export const shiftElement = <T extends { points: Point[] }>(element: T, shift: Point): T => ({
  ...element,
  points: element.points.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })),
});

export interface DiagramCodePlacement {
  shift: Point;
  /** Where to fit the view afterwards; null when the code replaced an existing diagram in place. */
  fit: Bounds | null;
}

/**
 * Where diagram code lands. Replacing a diagram takes the old one's corner; new code goes to the viewport
 * corner and is then scrolled into view. Anchored elements already sit where the user wants them.
 */
export const planDiagramCode = ({
  next,
  replaced,
  anchored,
  viewport,
}: {
  next: readonly DrawingElement[];
  replaced: readonly DrawingElement[];
  anchored: boolean;
  viewport: ViewportLike;
}): DiagramCodePlacement => {
  const from = cornerOf(next);
  const to = replaced.length > 0 ? cornerOf(replaced) : viewportCorner(viewport);
  const shift = anchored ? { x: 0, y: 0 } : { x: to.x - from.x, y: to.y - from.y };
  if (replaced.length > 0) return { shift, fit: null };

  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of next) {
    for (const p of element.points) {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const minX = from.x + shift.x;
  const minY = from.y + shift.y;
  const right = maxX + shift.x;
  const bottom = maxY + shift.y;
  return { shift, fit: { minX, minY, maxX: right, maxY: bottom, width: right - minX, height: bottom - minY } };
};

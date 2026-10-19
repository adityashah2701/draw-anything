import type { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";

export const makeBounds = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({
  minX,
  minY,
  maxX,
  maxY,
  width: maxX - minX,
  height: maxY - minY,
});

/** Smallest box holding all of `boxes`; null for none. */
export const unionBounds = (boxes: readonly Bounds[]): Bounds | null => {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return makeBounds(minX, minY, maxX, maxY);
};

export const centerOf = (b: Pick<Bounds, "minX" | "minY" | "maxX" | "maxY">): Point => ({
  x: (b.minX + b.maxX) / 2,
  y: (b.minY + b.maxY) / 2,
});

export const translateBounds = (b: Bounds, dx: number, dy: number): Bounds =>
  makeBounds(b.minX + dx, b.minY + dy, b.maxX + dx, b.maxY + dy);

/** True when the open interiors of `a` and `b` overlap on both axes. */
export const boxesOverlap = (a: Bounds, b: Bounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

export const isFiniteBounds = (b: Bounds | null | undefined): b is Bounds =>
  !!b && Number.isFinite(b.minX) && Number.isFinite(b.minY) && Number.isFinite(b.maxX) && Number.isFinite(b.maxY);

/** Drops floating-point dust (and -0) so quarter turns land exactly on whole coordinates. */
const clean = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/** Rotate `p` about `origin` by `degrees` (clockwise on screen, where y grows downwards). */
export const rotatePoint = (p: Point, origin: Point, degrees: number): Point => {
  if (degrees === 0) return { x: p.x, y: p.y };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: clean(origin.x + dx * cos - dy * sin), y: clean(origin.y + dx * sin + dy * cos) };
};

/** Axis-aligned box of `b` rotated by `degrees` about its own centre. */
export const rotatedBoundsAabb = (b: Bounds, degrees: number): Bounds => {
  if (!degrees) return b;
  const c = centerOf(b);
  const corners = [
    rotatePoint({ x: b.minX, y: b.minY }, c, degrees),
    rotatePoint({ x: b.maxX, y: b.minY }, c, degrees),
    rotatePoint({ x: b.maxX, y: b.maxY }, c, degrees),
    rotatePoint({ x: b.minX, y: b.maxY }, c, degrees),
  ];
  return makeBounds(
    Math.min(...corners.map((p) => p.x)),
    Math.min(...corners.map((p) => p.y)),
    Math.max(...corners.map((p) => p.x)),
    Math.max(...corners.map((p) => p.y)),
  );
};

/** Angle normalised to [0, 360). */
export const normalizeDegrees = (degrees: number): number => {
  const n = degrees % 360;
  return n < 0 ? n + 360 : n === 0 ? 0 : n;
};

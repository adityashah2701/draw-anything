// Geometry primitives for the diagram engine

export interface Point {
  x: number;
  y: number;
}

/** 4-boundary bounding box representation. Compatible with Aabb, Box, BoundsLike. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 6-property bounding box with pre-computed width and height. */
export interface Bounds extends Box {
  width: number;
  height: number;
}

/** Backward-compatible type alias for Aabb */
export type Aabb = Box;

/** Backward-compatible type alias for BoundsLike */
export type BoundsLike = Box;

/** Construct a complete Bounds object from 4 boundaries or a Box. */
export const toBounds = (box: Box): Bounds => ({
  minX: box.minX,
  minY: box.minY,
  maxX: box.maxX,
  maxY: box.maxY,
  width: Math.max(0, box.maxX - box.minX),
  height: Math.max(0, box.maxY - box.minY),
});

/** Construct a Box from any Bounds or Box object. */
export const toBox = (b: Box): Box => ({
  minX: b.minX,
  minY: b.minY,
  maxX: b.maxX,
  maxY: b.maxY,
});

/** Compute a Box enclosing an array of points. */
export const boundsFromPoints = (points: readonly Point[]): Bounds | null => {
  if (!points || points.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p && typeof p.x === "number" && typeof p.y === "number") {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/** Check if two boxes intersect. */
export const intersectsBox = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX &&
  a.maxX >= b.minX &&
  a.minY <= b.maxY &&
  a.maxY >= b.minY;

/** Check if outer box completely contains inner box. */
export const containsBox = (outer: Box, inner: Box): boolean =>
  outer.minX <= inner.minX &&
  outer.maxX >= inner.maxX &&
  outer.minY <= inner.minY &&
  outer.maxY >= inner.maxY;

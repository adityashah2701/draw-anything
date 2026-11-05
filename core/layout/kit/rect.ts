import type { Rect, Size } from "../types";

export const rectAt = (x: number, y: number, size: Size): Rect => ({ minX: x, minY: y, maxX: x + size.width, maxY: y + size.height });

/** Whether two rectangles are closer than `gap` (touching or overlapping when `gap` is 0). */
export const overlapsWithin = (a: Rect, b: Rect, gap = 0): boolean => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minY < b.maxY + gap && a.maxY > b.minY - gap;

export const centreOfRect = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });

export const unionOf = (rects: readonly Rect[]): Rect | null =>
  rects.length === 0
    ? null
    : { minX: Math.min(...rects.map((r) => r.minX)), minY: Math.min(...rects.map((r) => r.minY)), maxX: Math.max(...rects.map((r) => r.maxX)), maxY: Math.max(...rects.map((r) => r.maxY)) };

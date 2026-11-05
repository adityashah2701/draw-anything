import { overlapsWithin, rectAt } from "./rect";
import type { Rect, Size } from "../types";

const MAX_RINGS = 120;

/**
 * The free place nearest to `ideal` (a top-left corner) where a node of `size` fits with `gap` around it and
 * outside every obstacle and forbidden region. A deterministic outward search on a grid of `step`: the first
 * ring with a free place also looks one ring further and the nearest of those wins; ties go to reading order.
 * Null only when nothing within the search radius is free.
 */
export const findFreeSlot = (ideal: { x: number; y: number }, size: Size, obstacles: readonly Rect[], gap: number, step = Math.max(8, gap), forbidden: readonly Rect[] = []): { x: number; y: number } | null => {
  const free = (x: number, y: number) => {
    const rect = rectAt(x, y, size);
    return !obstacles.some((o) => overlapsWithin(rect, o, gap)) && !forbidden.some((f) => overlapsWithin(rect, f, 0));
  };
  let best: { x: number; y: number; d: number } | null = null;
  let foundAt = -1;
  for (let ring = 0; ring <= MAX_RINGS; ring += 1) {
    if (foundAt >= 0 && ring > foundAt + 1) break;
    const points: Array<[number, number]> = [];
    if (ring === 0) points.push([0, 0]);
    else {
      for (let k = -ring; k <= ring; k += 1) {
        points.push([k, -ring], [k, ring]);
        if (k > -ring && k < ring) points.push([-ring, k], [ring, k]);
      }
    }
    for (const [i, j] of points) {
      const x = ideal.x + i * step;
      const y = ideal.y + j * step;
      if (!free(x, y)) continue;
      const d = Math.hypot(i, j);
      if (foundAt < 0) foundAt = ring;
      if (!best || d < best.d || (d === best.d && (y < best.y || (y === best.y && x < best.x)))) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
};

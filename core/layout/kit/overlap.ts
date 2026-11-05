import { overlapsWithin, rectAt } from "./rect";
import type { Rect, Size } from "../types";

const MAX_PUSH = 80;

/**
 * Moves only the `movable` nodes so no two nodes are closer than `gap`: each movable node (in reading order, so the
 * result is deterministic) is pushed along the axis that needs the smallest move until it clears everything already
 * settled. Held nodes never move. Returns the final top-left of every movable node.
 */
export const resolveOverlaps = (
  start: ReadonlyMap<string, { x: number; y: number }>,
  size: ReadonlyMap<string, Size>,
  held: ReadonlyMap<string, { x: number; y: number }>,
  gap: number,
): Map<string, { x: number; y: number }> => {
  const settled: Rect[] = [...held].flatMap(([id, at]) => (size.get(id) ? [rectAt(at.x, at.y, size.get(id)!)] : []));
  const out = new Map<string, { x: number; y: number }>();
  const order = [...start].sort(([ia, a], [ib, b]) => a.y - b.y || a.x - b.x || ia.localeCompare(ib));
  for (const [id, at] of order) {
    const s = size.get(id);
    if (!s) continue;
    let x = at.x;
    let y = at.y;
    for (let i = 0; i < MAX_PUSH; i += 1) {
      const r = rectAt(x, y, s);
      const hit = settled.find((o) => overlapsWithin(r, o, gap));
      if (!hit) break;
      const right = hit.maxX + gap - r.minX;
      const left = r.maxX - (hit.minX - gap);
      const down = hit.maxY + gap - r.minY;
      const up = r.maxY - (hit.minY - gap);
      const best = Math.min(right, left, down, up);
      if (best === right) x += right;
      else if (best === left) x -= left;
      else if (best === down) y += down;
      else y -= up;
    }
    out.set(id, { x, y });
    settled.push(rectAt(x, y, s));
  }
  return out;
};

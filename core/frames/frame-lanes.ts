import { buildFrameIndex } from "./frame-index";
import type { FrameShape, StoredElement } from "@/core/model";
import { frameBox } from "./frame-model";
import { fail, type FrameResult } from "./frame-common";

/**
 * Re-partitions a pool's lanes (its child frames with the `lane` preset, in stacking order) so they exactly fill the
 * pool along its orientation, each keeping its share of the length it has now. Resizing a pool then grows its lanes
 * proportionally; contents are not moved. A pool with no lanes changes nothing.
 */
export const arrangeLanes = (stored: readonly StoredElement[], poolId: string): FrameResult => {
  const index = buildFrameIndex(stored);
  const pool = index.frames.get(poolId);
  if (!pool) return fail("not_found", `"${poolId}" is not a frame.`);
  const box = frameBox(pool);
  if (!box) return fail("invalid", "The pool has no box.");
  const lanes = (index.childrenOf.get(poolId) ?? []).flatMap((id) => {
    const f = index.frames.get(id);
    return f && f.preset === "lane" ? [f] : [];
  });
  if (lanes.length === 0) return { ok: true, patch: { add: [], update: [], remove: [] } };
  const vertical = pool.orientation === "vertical";
  const length = vertical ? box.width : box.height;
  const weights = lanes.map((lane) => {
    const b = frameBox(lane);
    return Math.max(1, b ? (vertical ? b.width : b.height) : 1);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let at = vertical ? box.minX : box.minY;
  const update = lanes.map((lane, i) => {
    const size = i === lanes.length - 1 ? (vertical ? box.maxX : box.maxY) - at : (length * weights[i]) / total;
    const points = vertical
      ? [{ x: at, y: box.minY }, { x: at + size, y: box.maxY }]
      : [{ x: box.minX, y: at }, { x: box.maxX, y: at + size }];
    at += size;
    return { ...lane, points } as unknown as StoredElement;
  });
  return { ok: true, patch: { add: [], update, remove: [] } };
};

/** Swaps lane `id` with its neighbour (`-1` towards the start, `1` towards the end) by exchanging their boxes, so lanes can be reordered. */
export const moveLane = (stored: readonly StoredElement[], poolId: string, laneId: string, direction: -1 | 1): FrameResult => {
  const index = buildFrameIndex(stored);
  const pool = index.frames.get(poolId);
  if (!pool) return fail("not_found", `"${poolId}" is not a frame.`);
  const lanes = (index.childrenOf.get(poolId) ?? []).flatMap((id) => (index.frames.get(id)?.preset === "lane" ? [index.frames.get(id)!] : []));
  const vertical = pool.orientation === "vertical";
  const key = (f: FrameShape) => (vertical ? f.points[0].x : f.points[0].y);
  const ordered = [...lanes].sort((a, b) => key(a) - key(b));
  const i = ordered.findIndex((l) => l.id === laneId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ordered.length) return { ok: true, patch: { add: [], update: [], remove: [] } };
  const [a, b] = [ordered[i], ordered[j]];
  const lenA = frameBox(a), lenB = frameBox(b);
  if (!lenA || !lenB) return fail("invalid", "A lane has no box.");
  // The one that comes first keeps the start of the pair; the second follows it: swap who is first.
  const first = i < j ? b : a;
  const second = i < j ? a : b;
  const start = Math.min(key(a), key(b));
  const size = (f: FrameShape) => { const bx = frameBox(f)!; return vertical ? bx.width : bx.height; };
  const place = (f: FrameShape, at: number) => {
    const bx = frameBox(f)!;
    const points = vertical ? [{ x: at, y: bx.minY }, { x: at + size(f), y: bx.maxY }] : [{ x: bx.minX, y: at }, { x: bx.maxX, y: at + size(f) }];
    return { ...f, points } as unknown as StoredElement;
  };
  return { ok: true, patch: { add: [], update: [place(first, start), place(second, start + size(first))], remove: [] } };
};


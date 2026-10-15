import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import type { Aabb } from "@/core/collision/aabb";
import { compressOrthogonalPath } from "@/core/routing/routing-utils";

/**
 * Obstacle-avoiding orthogonal route by search, for when every fixed path shape is blocked.
 *
 * The grid is the "Hanan grid": the lines through every box edge and through the two end points.
 * An optimal orthogonal route can always be drawn along those lines, so the search is exact and
 * small (a few hundred lines at most), and deterministic: ties are broken by vertex index.
 * Cost is length plus a fixed price per bend, so routes are short and straight rather than merely
 * clear.
 */

export interface GridRouteInput {
  from: Point;
  to: Point;
  /** Boxes the route must not enter (already padded by the caller). Touching an edge is allowed. */
  boxes: Aabb[];
  bendPenalty?: number;
}

const DEFAULT_BEND_PENALTY = 60;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const unique = (values: number[]) => [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

interface Entry {
  f: number;
  g: number;
  state: number;
  order: number;
}

/** Binary min-heap keyed by (f, order): `order` makes equal-cost pops deterministic. */
class Heap {
  private items: Entry[] = [];
  get size() {
    return this.items.length;
  }
  push(entry: Entry) {
    const a = this.items;
    a.push(entry);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop(): Entry {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  private less(x: Entry, y: Entry) {
    return x.f !== y.f ? x.f < y.f : x.order < y.order;
  }
}

/** Route from `from` to `to` around `boxes`, or null when no clear route exists. */
export const findGridRoute = ({ from, to, boxes, bendPenalty = DEFAULT_BEND_PENALTY }: GridRouteInput): Point[] | null => {
  const xs = unique([from.x, to.x, ...boxes.flatMap((b) => [b.minX, b.maxX])]);
  const ys = unique([from.y, to.y, ...boxes.flatMap((b) => [b.minY, b.maxY])]);
  const nx = xs.length;
  const ny = ys.length;
  const index = (i: number, j: number) => j * nx + i;

  // A segment between neighbouring grid lines is blocked iff its midpoint is strictly inside a box
  // (box edges lie on grid lines, so a segment is wholly inside, wholly outside or along an edge).
  const insideAny = (x: number, y: number) =>
    boxes.some((b) => x > b.minX + 1e-6 && x < b.maxX - 1e-6 && y > b.minY + 1e-6 && y < b.maxY - 1e-6);
  const stepBlocked = (i: number, j: number, di: number, dj: number) =>
    insideAny((xs[i] + xs[i + di]) / 2, (ys[j] + ys[j + dj]) / 2);

  const find = (arr: number[], v: number) => arr.indexOf(Math.round(v * 100) / 100);
  const si = find(xs, from.x);
  const sj = find(ys, from.y);
  const ti = find(xs, to.x);
  const tj = find(ys, to.y);
  if (si < 0 || sj < 0 || ti < 0 || tj < 0) return null;

  const states = nx * ny * 4;
  const best = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const heap = new Heap();
  let order = 0;
  const h = (i: number, j: number) => Math.abs(xs[i] - xs[ti]) + Math.abs(ys[j] - ys[tj]);

  // Start in every direction at zero cost, so the first segment's direction is free.
  for (let d = 0; d < 4; d += 1) {
    const s = index(si, sj) * 4 + d;
    best[s] = 0;
    heap.push({ f: h(si, sj), g: 0, state: s, order: order++ });
  }

  let goal = -1;
  while (heap.size > 0) {
    const { g, state } = heap.pop();
    if (g > best[state]) continue;
    const d = state % 4;
    const cell = (state - d) / 4;
    const i = cell % nx;
    const j = (cell - i) / nx;
    if (i === ti && j === tj) {
      goal = state;
      break;
    }
    for (let nd = 0; nd < 4; nd += 1) {
      const [di, dj] = DIRS[nd];
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (stepBlocked(i, j, di, dj)) continue;
      const length = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
      const turn = state !== index(si, sj) * 4 + d && nd !== d ? bendPenalty : 0;
      const ng = g + length + turn;
      const next = index(ni, nj) * 4 + nd;
      if (ng < best[next]) {
        best[next] = ng;
        parent[next] = state;
        heap.push({ f: ng + h(ni, nj), g: ng, state: next, order: order++ });
      }
    }
  }
  if (goal < 0) return null;

  const points: Point[] = [];
  for (let s = goal; s >= 0; s = parent[s]) {
    const cell = (s - (s % 4)) / 4;
    const i = cell % nx;
    points.push({ x: xs[i], y: ys[(cell - i) / nx] });
  }
  points.reverse();
  // snap the ends back to the exact requested coordinates (the grid rounds to 0.01)
  points[0] = { ...from };
  points[points.length - 1] = { ...to };
  return compressOrthogonalPath(points);
};

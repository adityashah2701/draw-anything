import type { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";

export interface Guide {
  axis: "x" | "y";
  /** World coordinate of the line (an x for axis "x", a y for axis "y"). */
  at: number;
  /** Extent along the line. */
  from: number;
  to: number;
}

export interface DragResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export interface DragInput {
  start: Point;
  point: Point;
  /** Bounds of everything being dragged, taken when the drag began. */
  selection: Bounds;
  /** Bounds of the shapes it may snap to (not the dragged ones). */
  targets: readonly Bounds[];
  /** World distance within which an edge or centre snaps. */
  threshold: number;
  snap: boolean;
}

const lines = (min: number, max: number) => [min, (min + max) / 2, max];

interface AxisSnap {
  shift: number;
  hit: boolean;
}

/** Smallest shift that brings one of the selection's three lines onto one of a target's three lines. */
const snapAxis = (
  selection: readonly number[],
  targets: readonly (readonly number[])[],
  threshold: number,
): AxisSnap => {
  let best = Infinity;
  for (const t of targets) {
    for (const s of selection) {
      for (const line of t) {
        const d = line - s;
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
    }
  }
  return Math.abs(best) <= threshold ? { shift: best, hit: true } : { shift: 0, hit: false };
};

const EPS = 0.5;

/**
 * Where a drag puts the selection. The position is always origin + total pointer travel (never an
 * accumulation of per-event deltas, so it cannot drift), then pulled onto nearby edges/centres of
 * other shapes. Guides describe every line that ended up aligned.
 */
export const computeDrag = ({ start, point, selection, targets, threshold, snap }: DragInput): DragResult => {
  let dx = point.x - start.x;
  let dy = point.y - start.y;
  if (!snap || targets.length === 0) return { dx, dy, guides: [] };

  const sx = lines(selection.minX + dx, selection.maxX + dx);
  const sy = lines(selection.minY + dy, selection.maxY + dy);
  // Cheap reject first: only targets near the selection on the *other* axis can matter visually,
  // but alignment is meaningful at any distance, so nothing is excluded here beyond the caller's filter.
  const snapX = snapAxis(sx, targets.map((t) => lines(t.minX, t.maxX)), threshold);
  const snapY = snapAxis(sy, targets.map((t) => lines(t.minY, t.maxY)), threshold);
  dx += snapX.shift;
  dy += snapY.shift;

  const moved = { minX: selection.minX + dx, maxX: selection.maxX + dx, minY: selection.minY + dy, maxY: selection.maxY + dy };
  const mx = lines(moved.minX, moved.maxX);
  const my = lines(moved.minY, moved.maxY);
  const guides: Guide[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    if (snapX.hit) {
      for (const line of lines(t.minX, t.maxX)) {
        if (mx.some((m) => Math.abs(m - line) < EPS) && !seen.has(`x${line}`)) {
          seen.add(`x${line}`);
          guides.push({ axis: "x", at: line, from: Math.min(moved.minY, t.minY), to: Math.max(moved.maxY, t.maxY) });
        }
      }
    }
    if (snapY.hit) {
      for (const line of lines(t.minY, t.maxY)) {
        if (my.some((m) => Math.abs(m - line) < EPS) && !seen.has(`y${line}`)) {
          seen.add(`y${line}`);
          guides.push({ axis: "y", at: line, from: Math.min(moved.minX, t.minX), to: Math.max(moved.maxX, t.maxX) });
        }
      }
    }
  }
  return { dx, dy, guides };
};

export const unionBounds = (boxes: readonly Bounds[]): Bounds | null => {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

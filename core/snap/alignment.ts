import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";

/**
 * Smart-guide geometry for moving a box among others: which lines it aligns with, which spacing it
 * can match, and how far it is from its neighbours. Pure and in world units; the caller turns a
 * screen-pixel tolerance into `threshold` by dividing by zoom, which is what makes snapping feel the
 * same at every zoom. Connector-anchor snapping (`use-magnetic-snap.ts`) is a separate system and is
 * not touched by any of this.
 */

/** An alignment line drawn while dragging: `at` on `axis`, spanning `from`..`to` along the other axis. */
export interface Guide {
  axis: "x" | "y";
  /** World coordinate of the line (an x for axis "x", a y for axis "y"). */
  at: number;
  /** Extent along the line. */
  from: number;
  to: number;
  /** A text baseline rather than an edge or centre. */
  kind?: "baseline";
}

/**
 * A distance between two boxes. `gap` spans are equal spacings the move is snapping to (drawn
 * emphasised); `distance` spans are plain live measurements to the nearest neighbours.
 */
export interface Span {
  axis: "x" | "y";
  from: number;
  to: number;
  /** Position on the other axis where the span is drawn. */
  at: number;
  kind: "gap" | "distance";
}

/** Something the moving box may align with. `baselines` are absolute y positions of text baselines. */
export interface AlignTarget {
  box: Bounds;
  baselines?: readonly number[];
}

export interface SnapOptions {
  /** Match equal spacing between neighbours. */
  spacing?: boolean;
  /** Report distances to the nearest neighbours. */
  measures?: boolean;
}

export interface SnapInput {
  /** The box at the position the pointer asks for, before any snapping. */
  moving: Bounds;
  /** Absolute y of the moving selection's text baselines, at that same position. */
  movingBaselines?: readonly number[];
  /** What edges, centres and baselines may align with (any distance away). */
  alignTargets: readonly AlignTarget[];
  /** What spacing and distances are measured against (usually whole groups and loose shapes). */
  spaceTargets?: readonly Bounds[];
  /** World distance within which a line or a spacing snaps. */
  threshold: number;
  options?: SnapOptions;
}

export interface SnapResult {
  /** How far to shift the box from where the pointer put it. */
  dx: number;
  dy: number;
  guides: Guide[];
  spans: Span[];
}

/** Two coordinates this close count as the same line (world units). */
const SAME = 0.5;
/** Spacing smaller than this is a touch or overlap, not a gap worth matching or showing. */
const MIN_GAP = 1;
/** Neighbours further than this are not worth a measurement line. */
const MAX_MEASURE = 4000;

const lines = (min: number, max: number) => [min, (min + max) / 2, max];

interface Candidate {
  d: number;
  spans: Span[];
}

/** One axis worth of alignment: the smallest shift that brings a moving line onto a target line. */
const alignAxis = (moving: readonly number[], targets: readonly (readonly number[])[], threshold: number) => {
  let best = Infinity;
  for (const t of targets) {
    for (const s of moving) {
      for (const line of t) {
        const d = line - s;
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
    }
  }
  return Math.abs(best) <= threshold ? { d: best, hit: true } : { d: 0, hit: false };
};

interface AxisView {
  lo: (b: Bounds) => number;
  hi: (b: Bounds) => number;
  crossLo: (b: Bounds) => number;
  crossHi: (b: Bounds) => number;
}
const X: AxisView = { lo: (b) => b.minX, hi: (b) => b.maxX, crossLo: (b) => b.minY, crossHi: (b) => b.maxY };
const Y: AxisView = { lo: (b) => b.minY, hi: (b) => b.maxY, crossLo: (b) => b.minX, crossHi: (b) => b.maxX };

const crossOverlap = (v: AxisView, a: Bounds, b: Bounds) => Math.min(v.crossHi(a), v.crossHi(b)) - Math.max(v.crossLo(a), v.crossLo(b));

/** Where to draw a span between `a` and `b` on the cross axis: the middle of what they share (or of `moving`). */
const spanPosition = (v: AxisView, moving: Bounds, a: Bounds, b: Bounds) => {
  const lo = Math.max(v.crossLo(a), v.crossLo(b), v.crossLo(moving));
  const hi = Math.min(v.crossHi(a), v.crossHi(b), v.crossHi(moving));
  if (hi >= lo) return (lo + hi) / 2;
  return (v.crossLo(moving) + v.crossHi(moving)) / 2;
};

/**
 * Shifts along one axis that make the moving box's gaps equal, with the spans to draw for each:
 *  - between its two nearest neighbours, so the gap on both sides is the same;
 *  - after the nearest neighbour on its left, or before the nearest on its right, at the same distance
 *    as some gap that already exists between two other shapes in that row.
 * "Row" is every target that overlaps the moving box on the other axis.
 */
const spacingCandidates = (v: AxisView, axis: "x" | "y", moving: Bounds, targets: readonly Bounds[], threshold: number): Candidate[] => {
  const row = targets.filter((t) => crossOverlap(v, moving, t) > 0).sort((a, b) => v.lo(a) - v.lo(b));
  if (row.length === 0) return [];

  const size = v.hi(moving) - v.lo(moving);
  const centre = (v.lo(moving) + v.hi(moving)) / 2;
  let left: Bounds | null = null;
  let right: Bounds | null = null;
  for (const t of row) {
    const c = (v.lo(t) + v.hi(t)) / 2;
    if (c < centre) {
      if (!left || v.hi(t) > v.hi(left)) left = t;
    } else if (!right || v.lo(t) < v.lo(right)) right = t;
  }

  const gaps: { a: Bounds; b: Bounds; size: number }[] = [];
  for (let i = 0; i + 1 < row.length; i += 1) {
    const s = v.lo(row[i + 1]) - v.hi(row[i]);
    if (s >= MIN_GAP) gaps.push({ a: row[i], b: row[i + 1], size: s });
  }

  const out: Candidate[] = [];
  const span = (from: number, to: number, at: number): Span => ({ axis, from, to, at, kind: "gap" });
  const add = (newLo: number, spans: Span[]) => {
    const d = newLo - v.lo(moving);
    if (Math.abs(d) <= threshold) out.push({ d, spans });
  };

  if (left && right) {
    const free = v.lo(right) - v.hi(left) - size;
    if (free >= 2 * MIN_GAP) {
      const newLo = v.hi(left) + free / 2;
      const at = spanPosition(v, moving, left, right);
      add(newLo, [span(v.hi(left), newLo, at), span(newLo + size, v.lo(right), at)]);
    }
  }
  for (const gap of gaps) {
    const shown = span(v.hi(gap.a), v.lo(gap.b), spanPosition(v, moving, gap.a, gap.b));
    if (left && gap.a !== left) {
      const newLo = v.hi(left) + gap.size;
      add(newLo, [shown, span(v.hi(left), newLo, spanPosition(v, moving, left, moving))]);
    }
    if (right && gap.b !== right) {
      const newHi = v.lo(right) - gap.size;
      add(newHi - size, [shown, span(newHi, v.lo(right), spanPosition(v, moving, right, moving))]);
    }
  }
  return out;
};

/** Distances from the box to the nearest neighbour in each direction (those it overlaps on the other axis). */
const measureSpans = (moved: Bounds, targets: readonly Bounds[]): Span[] => {
  const out: Span[] = [];
  const nearest = (v: AxisView, axis: "x" | "y") => {
    let before: Bounds | null = null;
    let after: Bounds | null = null;
    for (const t of targets) {
      if (crossOverlap(v, moved, t) <= 0) continue;
      if (v.hi(t) <= v.lo(moved) + 1e-9) {
        if (!before || v.hi(t) > v.hi(before)) before = t;
      } else if (v.lo(t) >= v.hi(moved) - 1e-9) {
        if (!after || v.lo(t) < v.lo(after)) after = t;
      }
    }
    if (before && v.lo(moved) - v.hi(before) <= MAX_MEASURE) {
      out.push({ axis, from: v.hi(before), to: v.lo(moved), at: spanPosition(v, moved, before, moved), kind: "distance" });
    }
    if (after && v.lo(after) - v.hi(moved) <= MAX_MEASURE) {
      out.push({ axis, from: v.hi(moved), to: v.lo(after), at: spanPosition(v, moved, after, moved), kind: "distance" });
    }
  };
  nearest(X, "x");
  nearest(Y, "y");
  return out.filter((s) => s.to - s.from > 0);
};

const sameSpan = (a: Span, b: Span) => a.axis === b.axis && Math.abs(a.from - b.from) < SAME && Math.abs(a.to - b.to) < SAME;

/**
 * Where the box ends up when it is pulled onto nearby lines and spacings, and what to show for it.
 * The pointer's position is never accumulated into: the result depends only on `input`, so the same
 * pointer position always gives the same snap however it was reached.
 */
export const snapSelection = ({ moving, movingBaselines = [], alignTargets, spaceTargets = [], threshold, options = {} }: SnapInput): SnapResult => {
  const mx = lines(moving.minX, moving.maxX);
  const my = lines(moving.minY, moving.maxY);

  // Alignment: edges and centres on both axes; text baselines join the vertical one.
  const targetX = alignTargets.map((t) => lines(t.box.minX, t.box.maxX));
  const targetY = alignTargets.map((t) => lines(t.box.minY, t.box.maxY));
  const baselineTargets = movingBaselines.length > 0 ? alignTargets.filter((t) => t.baselines && t.baselines.length > 0) : [];
  const alignedX = alignAxis(mx, targetX, threshold);
  const edgeY = alignAxis(my, targetY, threshold);
  const baselineY = alignAxis(movingBaselines, baselineTargets.map((t) => t.baselines!), threshold);
  const alignedY = edgeY.hit && (!baselineY.hit || Math.abs(edgeY.d) <= Math.abs(baselineY.d)) ? edgeY : baselineY.hit ? baselineY : edgeY;

  // Spacing: equal gaps along each axis.
  const spacingX = options.spacing ? spacingCandidates(X, "x", moving, spaceTargets, threshold) : [];
  const spacingY = options.spacing ? spacingCandidates(Y, "y", moving, spaceTargets, threshold) : [];

  const choose = (aligned: { d: number; hit: boolean }, spacing: Candidate[]) => {
    let best = aligned.hit ? Math.abs(aligned.d) : Infinity;
    for (const c of spacing) best = Math.min(best, Math.abs(c.d));
    if (best === Infinity) return { d: 0, aligned: false, spacing: [] as Candidate[] };
    const useAlign = aligned.hit && Math.abs(Math.abs(aligned.d) - best) < 1e-6;
    const chosen = spacing.filter((c) => Math.abs(Math.abs(c.d) - best) < 1e-6);
    const d = useAlign ? aligned.d : chosen[0].d;
    return { d, aligned: useAlign, spacing: chosen.filter((c) => Math.abs(c.d - d) < 1e-6) };
  };
  const pickX = choose(alignedX, spacingX);
  const pickY = choose(alignedY, spacingY);
  const dx = pickX.d;
  const dy = pickY.d;

  const box: Bounds = {
    minX: moving.minX + dx,
    maxX: moving.maxX + dx,
    minY: moving.minY + dy,
    maxY: moving.maxY + dy,
    width: moving.width,
    height: moving.height,
  };
  const bx = lines(box.minX, box.maxX);
  const by = lines(box.minY, box.maxY);
  const bBaselines = movingBaselines.map((y) => y + dy);

  const guides: Guide[] = [];
  const seen = new Set<string>();
  for (const t of alignTargets) {
    if (pickX.aligned) {
      for (const line of lines(t.box.minX, t.box.maxX)) {
        if (bx.some((m) => Math.abs(m - line) < SAME) && !seen.has(`x${line}`)) {
          seen.add(`x${line}`);
          guides.push({ axis: "x", at: line, from: Math.min(box.minY, t.box.minY), to: Math.max(box.maxY, t.box.maxY) });
        }
      }
    }
    if (pickY.aligned) {
      for (const line of lines(t.box.minY, t.box.maxY)) {
        if (by.some((m) => Math.abs(m - line) < SAME) && !seen.has(`y${line}`)) {
          seen.add(`y${line}`);
          guides.push({ axis: "y", at: line, from: Math.min(box.minX, t.box.minX), to: Math.max(box.maxX, t.box.maxX) });
        }
      }
      for (const baseline of t.baselines ?? []) {
        if (bBaselines.some((m) => Math.abs(m - baseline) < SAME) && !seen.has(`b${baseline}`)) {
          seen.add(`b${baseline}`);
          guides.push({ axis: "y", at: baseline, from: Math.min(box.minX, t.box.minX), to: Math.max(box.maxX, t.box.maxX), kind: "baseline" });
        }
      }
    }
  }

  const spans: Span[] = [];
  for (const c of [...pickX.spacing, ...pickY.spacing]) for (const s of c.spans) if (!spans.some((e) => sameSpan(e, s) && Math.abs(e.at - s.at) < SAME)) spans.push(s);
  if (options.measures) {
    for (const s of measureSpans(box, spaceTargets)) if (!spans.some((e) => sameSpan(e, s))) spans.push(s);
  }
  return { dx, dy, guides, spans };
};

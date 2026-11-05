import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { Box } from "./geometry";
import { isNodeElement, nodeBox } from "./metrics";

/**
 * Judgement-shaped measures that `measureLayout` (counts of faults) does not give: how much air arrows
 * leave around shapes, how tidy the rows and columns are, whether the drawing reads in one direction.
 * Geometry only, in world units, pure: the same elements always give the same numbers.
 */
export interface Aesthetics {
  /** Shortest gap between an arrow and a shape that is not one of its own ends; null when none passes one. */
  minClearance: number | null;
  maxBends: number;
  meanBends: number;
  /** Share of shapes whose centre lines up (x or y) with another shape's. 1 for fewer than two shapes. */
  alignment: number;
  /** How far the drawing's weight sits from the middle of its extent, 0 (centred) to about 1. */
  centroidOffset: number;
  /** Share of connections that run with the drawing's dominant direction. 1 for fewer than two. */
  readingConsistency: number;
  /** Mean of (frame area / members' bounding area) over group frames, 1 is tight; null without groups. */
  groupLooseness: number | null;
}

const ALIGN_TOLERANCE = 2;
const round = (value: number) => Math.round(value * 1000) / 1000;

const pointToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const segmentsIntersect = (a: Point, b: Point, c: Point, d: Point) => {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

const inside = (p: Point, box: Box) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;

/** Shortest distance from the segment p-q to the rectangle `box` (0 when they touch, cross or one holds the other). */
export const segmentBoxDistance = (p: Point, q: Point, box: Box): number => {
  if (inside(p, box) || inside(q, box)) return 0;
  const corners: Point[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  let best = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    if (segmentsIntersect(p, q, a, b)) return 0;
    best = Math.min(best, pointToSegment(p, a, b), pointToSegment(q, a, b), pointToSegment(a, p, q), pointToSegment(b, p, q));
  }
  return best;
};

const centreOf = (box: Box): Point => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });

const isArrow = (e: DrawingElement) => e.type === "arrow" || e.type === "arrow-bidirectional";

export const measureAesthetics = (
  elements: DrawingElement[],
  groups: Array<{ id: string; nodeIds: string[] }> = [],
): Aesthetics => {
  const nodes = elements.filter(isNodeElement);
  const arrows = elements.filter(isArrow);
  const boxes = new Map(nodes.map((n) => [n.id, nodeBox(n)]));
  const centres = new Map([...boxes].map(([id, box]) => [id, centreOf(box)]));

  let minClearance = Infinity;
  for (const arrow of arrows) {
    const own = new Set([arrow.startConnection?.elementId, arrow.endConnection?.elementId]);
    for (const node of nodes) {
      if (own.has(node.id)) continue;
      const box = boxes.get(node.id)!;
      for (let i = 0; i < arrow.points.length - 1; i += 1) {
        minClearance = Math.min(minClearance, segmentBoxDistance(arrow.points[i], arrow.points[i + 1], box));
      }
    }
  }

  const bends = arrows.map((a) => Math.max(0, a.points.length - 2));

  const list = [...centres.values()];
  const aligned = list.filter((c, i) =>
    list.some((o, j) => j !== i && (Math.abs(o.x - c.x) <= ALIGN_TOLERANCE || Math.abs(o.y - c.y) <= ALIGN_TOLERANCE)),
  ).length;

  const all = [...boxes.values()];
  let centroidOffset = 0;
  if (list.length > 0) {
    const minX = Math.min(...all.map((b) => b.minX));
    const maxX = Math.max(...all.map((b) => b.maxX));
    const minY = Math.min(...all.map((b) => b.minY));
    const maxY = Math.max(...all.map((b) => b.maxY));
    const half = Math.hypot(maxX - minX, maxY - minY) / 2;
    const cx = list.reduce((s, c) => s + c.x, 0) / list.length;
    const cy = list.reduce((s, c) => s + c.y, 0) / list.length;
    centroidOffset = half > 0 ? Math.hypot(cx - (minX + maxX) / 2, cy - (minY + maxY) / 2) / half : 0;
  }

  const vectors = arrows.flatMap((a) => {
    const from = centres.get(a.startConnection?.elementId ?? "");
    const to = centres.get(a.endConnection?.elementId ?? "");
    return from && to ? [{ dx: to.x - from.x, dy: to.y - from.y }] : [];
  });
  let readingConsistency = 1;
  if (vectors.length >= 2) {
    const alongX = vectors.reduce((s, v) => s + Math.abs(v.dx), 0) > vectors.reduce((s, v) => s + Math.abs(v.dy), 0);
    const parts = vectors.map((v) => (alongX ? v.dx : v.dy));
    const positive = parts.filter((v) => v > 0.5).length;
    const negative = parts.filter((v) => v < -0.5).length;
    readingConsistency = (vectors.length - Math.min(positive, negative)) / vectors.length;
  }

  const frames = new Map(elements.filter((e) => e.ai?.role === "group").map((f) => [f.ai?.semanticId ?? f.id, nodeBox(f)]));
  const ratios: number[] = [];
  for (const group of groups) {
    const frame = frames.get(group.id);
    const memberBoxes = group.nodeIds
      .map((id) => nodes.find((n) => (n.ai?.semanticId ?? n.id) === id))
      .filter((n): n is DrawingElement => !!n)
      .map((n) => boxes.get(n.id)!);
    if (!frame || memberBoxes.length < 2) continue;
    const width = Math.max(...memberBoxes.map((b) => b.maxX)) - Math.min(...memberBoxes.map((b) => b.minX));
    const height = Math.max(...memberBoxes.map((b) => b.maxY)) - Math.min(...memberBoxes.map((b) => b.minY));
    if (width > 0 && height > 0) ratios.push(((frame.maxX - frame.minX) * (frame.maxY - frame.minY)) / (width * height));
  }

  return {
    minClearance: Number.isFinite(minClearance) ? round(minClearance) : null,
    maxBends: bends.length ? Math.max(...bends) : 0,
    meanBends: bends.length ? round(bends.reduce((a, b) => a + b, 0) / bends.length) : 0,
    alignment: list.length < 2 ? 1 : round(aligned / list.length),
    centroidOffset: round(centroidOffset),
    readingConsistency: round(readingConsistency),
    groupLooseness: ratios.length ? round(ratios.reduce((a, b) => a + b, 0) / ratios.length) : null,
  };
};

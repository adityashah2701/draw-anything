import { Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  Aabb,
  intersectsAabb,
  expandAabb,
  segmentBounds,
} from "@/core/collision/aabb";
import {
  pathIntersectsObstacles,
  RoutingObstacle,
} from "@/core/routing/algorithms/obstacle-avoidance";

/**
 * Unified route scoring model.
 *
 * Every candidate route is scored using a weighted sum of penalties.
 * Lower score = better route. A score of Infinity means the route is
 * invalid and must never be selected.
 */

export interface PathScoreWeights {
  /** Penalty per shape body intersection (should be very high / Infinity). */
  shapeIntersection: number;
  /** Penalty per crossing with another arrow segment. */
  crossing: number;
  /** Penalty per collinear overlap with another arrow segment. */
  arrowOverlap: number;
  /** Penalty per bend (direction change) in the path. */
  bend: number;
  /** Penalty per pixel of total path length. */
  length: number;
  /** Penalty proportional to max detour from the direct line. */
  detour: number;
  /** Penalty when first leg doesn't match preferred routing direction. */
  preference: number;
  /** Penalty per layer boundary crossed unnecessarily. */
  layerViolation: number;
  /** Penalty when a route cuts through an unrelated cluster. */
  clusterViolation: number;
  /** Penalty when any single segment spans >60% of source-to-target distance. */
  backboneSpan: number;
  /** Penalty from congestion map (routing through high-traffic zones). */
  centralCongestion: number;
}

export const DEFAULT_SCORE_WEIGHTS: PathScoreWeights = {
  shapeIntersection: 1e9,
  crossing: 1700,
  arrowOverlap: 1200,
  bend: 960,
  length: 1,
  detour: 0.18,
  preference: 56,
  layerViolation: 800,
  clusterViolation: 600,
  backboneSpan: 400,
  centralCongestion: 1,
};

export interface PathScoringContext {
  /** Start point of the arrow. */
  start: Point;
  /** End point of the arrow. */
  end: Point;
  /** Preferred first-leg direction. */
  preferredDirection: "vh" | "hv";
  /** All shape obstacles on the canvas. */
  obstacles: RoutingObstacle[];
  /** IDs of obstacles to ignore (source/target shapes). */
  ignoreObstacleIds: Set<string>;
  /** Padding around obstacles. */
  obstaclePadding: number;
  /** Optional layer boundary Y-coordinates (top of each layer). */
  layerBoundaryYs?: number[];
  /** Optional cluster bounding boxes. */
  clusterBounds?: Aabb[];
  /** Optional external crossing counter. */
  externalCrossingCount?: (path: Point[]) => number;
  /** Optional external overlap counter. */
  externalOverlapCount?: (path: Point[]) => number;
  /** Optional congestion map penalty callback. */
  externalCongestionPenalty?: (path: Point[]) => number;
}

// ───────────────── Internal helpers ─────────────────

const manhattanLength = (points: Point[]): number => {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.abs(points[i + 1].x - points[i].x);
    total += Math.abs(points[i + 1].y - points[i].y);
  }
  return total;
};

const countBends = (points: Point[]): number => Math.max(0, points.length - 2);

const computeDetour = (points: Point[], start: Point, end: Point): number => {
  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  let maxDev = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const dev = Math.abs(points[i].x - cx) + Math.abs(points[i].y - cy);
    if (dev > maxDev) maxDev = dev;
  }
  return maxDev;
};

const getFirstLegDirection = (points: Point[]): "vh" | "hv" => {
  if (points.length < 2) return "hv";
  return points[0].x === points[1].x ? "vh" : "hv";
};

const segmentLength = (a: Point, b: Point): number =>
  Math.abs(b.x - a.x) + Math.abs(b.y - a.y);

const computeBackboneSpan = (
  points: Point[],
  start: Point,
  end: Point,
): number => {
  const directDist = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
  if (directDist < 1) return 0;

  let maxRatio = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = segmentLength(points[i], points[i + 1]);
    const ratio = len / directDist;
    if (ratio > maxRatio) maxRatio = ratio;
  }

  // Only penalize if a single segment spans >60% of the direct distance.
  return maxRatio > 0.6 ? maxRatio : 0;
};

const countLayerCrossings = (
  points: Point[],
  layerBoundaryYs: number[],
  startY: number,
  endY: number,
): number => {
  if (layerBoundaryYs.length === 0) return 0;

  // Only penalize crossing boundaries that aren't between source/target layers.
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);

  let violations = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const segMinY = Math.min(points[i].y, points[i + 1].y);
    const segMaxY = Math.max(points[i].y, points[i + 1].y);

    for (const boundaryY of layerBoundaryYs) {
      // Skip boundaries that are naturally between source and target.
      if (boundaryY >= minY && boundaryY <= maxY) continue;
      // Check if this segment crosses an unnecessary layer boundary.
      if (segMinY < boundaryY && segMaxY > boundaryY) {
        violations += 1;
      }
    }
  }
  return violations;
};

const countClusterIntrusions = (
  points: Point[],
  clusterBounds: Aabb[],
): number => {
  let intrusions = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const segBounds = expandAabb(segmentBounds(points[i], points[i + 1]), 1);
    for (const cluster of clusterBounds) {
      if (intersectsAabb(segBounds, cluster)) {
        intrusions += 1;
        break; // Count at most one cluster intrusion per segment.
      }
    }
  }
  return intrusions;
};

// ───────────────── Public API ─────────────────

/**
 * Compute the total weighted score for a candidate route.
 * Lower is better. Returns Infinity for invalid routes.
 */
export const scorePath = (
  path: Point[],
  context: PathScoringContext,
  weights: PathScoreWeights = DEFAULT_SCORE_WEIGHTS,
): number => {
  if (path.length < 2) return Infinity;

  // ── Shape intersection (infinite penalty) ──
  if (
    pathIntersectsObstacles(
      path,
      context.obstacles,
      context.ignoreObstacleIds,
      context.obstaclePadding,
    )
  ) {
    return weights.shapeIntersection;
  }

  let score = 0;

  // ── Bend penalty ──
  score += countBends(path) * weights.bend;

  // ── Length penalty ──
  score += manhattanLength(path) * weights.length;

  // ── Detour penalty ──
  score += computeDetour(path, context.start, context.end) * weights.detour;

  // ── Preference penalty ──
  if (getFirstLegDirection(path) !== context.preferredDirection) {
    score += weights.preference;
  }

  // ── Backbone span penalty ──
  const backbone = computeBackboneSpan(path, context.start, context.end);
  score += backbone * weights.backboneSpan;

  // ── Layer violation penalty ──
  if (context.layerBoundaryYs && context.layerBoundaryYs.length > 0) {
    score +=
      countLayerCrossings(
        path,
        context.layerBoundaryYs,
        context.start.y,
        context.end.y,
      ) * weights.layerViolation;
  }

  // ── Cluster intrusion penalty ──
  if (context.clusterBounds && context.clusterBounds.length > 0) {
    score +=
      countClusterIntrusions(path, context.clusterBounds) *
      weights.clusterViolation;
  }

  // ── External crossing penalty ──
  if (context.externalCrossingCount) {
    score += context.externalCrossingCount(path) * weights.crossing;
  }

  // ── External overlap penalty ──
  if (context.externalOverlapCount) {
    score += context.externalOverlapCount(path) * weights.arrowOverlap;
  }

  // ── Central congestion penalty ──
  if (context.externalCongestionPenalty) {
    score +=
      context.externalCongestionPenalty(path) * weights.centralCongestion;
  }

  return score;
};

/**
 * Pick the best route from a list of candidates using unified scoring.
 * Returns the candidate with the lowest score.
 */
export const pickBestRoute = (
  candidates: Point[][],
  context: PathScoringContext,
  weights: PathScoreWeights = DEFAULT_SCORE_WEIGHTS,
): { path: Point[]; score: number; index: number } => {
  let bestPath = candidates[0];
  let bestScore = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const score = scorePath(candidates[i], context, weights);
    if (score < bestScore) {
      bestScore = score;
      bestPath = candidates[i];
      bestIndex = i;
    }
  }

  return { path: bestPath, score: bestScore, index: bestIndex };
};

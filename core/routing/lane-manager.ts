import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { EPSILON, orthogonalizePath } from "@/core/routing/routing-utils";

/**
 * Lane manager for systematic lane allocation.
 *
 * When multiple arrow segments share the same axis-aligned corridor,
 * this module assigns each a distinct "lane" so they don't visually overlap.
 * Lanes are indexed from the center outward: -3, -2, -1, 0, +1, +2, +3.
 */

type SegmentOrientation = "horizontal" | "vertical";

interface LaneSegment {
  arrowId: string;
  segmentIndex: number;
  orientation: SegmentOrientation;
  fixedCoord: number;
  rangeStart: number;
  rangeEnd: number;
}

export interface LaneAssignment {
  arrowId: string;
  segmentIndex: number;
  lane: number;
  offset: number;
}

export interface LaneManagerOptions {
  /** Minimum distance between parallel lane centers (px). */
  laneSpacing?: number;
  /** Maximum number of lanes in each direction from center. */
  maxLanes?: number;
  /** Minimum overlap length to consider two segments "sharing a corridor". */
  minOverlap?: number;
  /** Whether to snap lane offsets to the nearest grid multiple. */
  snapToGrid?: boolean;
  /** Grid size in pixels for snapping. Default: 16. */
  gridSize?: number;
}

const DEFAULT_LANE_SPACING = 14;
const DEFAULT_MAX_LANES = 4;
const DEFAULT_MIN_OVERLAP = 8;
const DEFAULT_GRID_SIZE = 16;

const snapToGridValue = (value: number, gridSize: number): number =>
  Math.round(value / gridSize) * gridSize;

const extractSegment = (
  arrowId: string,
  points: Point[],
  index: number,
): LaneSegment | null => {
  if (index < 0 || index >= points.length - 1) return null;
  const from = points[index];
  const to = points[index + 1];
  if (Math.abs(from.y - to.y) < EPSILON) {
    return {
      arrowId,
      segmentIndex: index,
      orientation: "horizontal",
      fixedCoord: from.y,
      rangeStart: Math.min(from.x, to.x),
      rangeEnd: Math.max(from.x, to.x),
    };
  }

  if (Math.abs(from.x - to.x) < EPSILON) {
    return {
      arrowId,
      segmentIndex: index,
      orientation: "vertical",
      fixedCoord: from.x,
      rangeStart: Math.min(from.y, to.y),
      rangeEnd: Math.max(from.y, to.y),
    };
  }

  return null;
};

const centeredLane = (position: number, total: number): number => {
  if (total <= 1) return 0;
  if (total % 2 === 1) return position - (total - 1) / 2;
  return position - total / 2 + 0.5;
};

/**
 * Compute lane assignments for all segments across all routed arrows.
 * Groups collinear segments sharing the same corridor and assigns
 * each a distinct lane offset.
 */
export const computeLaneAssignments = (
  routes: Array<{ arrowId: string; points: Point[] }>,
  options: LaneManagerOptions = {},
): LaneAssignment[] => {
  const laneSpacing = options.laneSpacing ?? DEFAULT_LANE_SPACING;
  const maxLanes = options.maxLanes ?? DEFAULT_MAX_LANES;
  const minOverlap = options.minOverlap ?? DEFAULT_MIN_OVERLAP;
  const shouldSnap = options.snapToGrid ?? false;
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;

  // Extract all segments.
  const allSegments: LaneSegment[] = [];
  for (const route of routes) {
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const seg = extractSegment(route.arrowId, route.points, i);
      if (seg) allSegments.push(seg);
    }
  }

  // Group segments by corridor using hash-map bucketing — O(n) instead of O(n²).
  // Bucket key = "{orientation}:{snappedFixedCoord}" where coord is snapped to
  // the nearest 2px (corridorThreshold) to merge near-identical y/x values.
  const CORRIDOR_SNAP = 2; // px — same as original corridorThreshold
  const buckets = new Map<string, LaneSegment[]>();
  for (const seg of allSegments) {
    const snapped = Math.round(seg.fixedCoord / CORRIDOR_SNAP) * CORRIDOR_SNAP;
    const bucketKey = `${seg.orientation}:${snapped}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = [];
      buckets.set(bucketKey, bucket);
    }
    bucket.push(seg);
  }

  // From each bucket, further filter to segments that actually overlap in range.
  const groups: LaneSegment[][] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    // Within a corridor-bucket, group by range overlap using a sweep.
    // Sort by rangeStart for an efficient single-pass overlap union-find.
    const sorted = [...bucket].sort((a, b) => a.rangeStart - b.rangeStart);
    const group: LaneSegment[] = [sorted[0]];
    let maxRangeEnd = sorted[0].rangeEnd;
    for (let k = 1; k < sorted.length; k++) {
      const seg = sorted[k];
      if (seg.rangeStart <= maxRangeEnd + minOverlap) {
        // Overlaps with at least one existing segment in this group
        group.push(seg);
        maxRangeEnd = Math.max(maxRangeEnd, seg.rangeEnd);
      } else {
        // Gap: flush current group, start new one
        if (group.length >= 2) groups.push([...group]);
        group.length = 0;
        group.push(seg);
        maxRangeEnd = seg.rangeEnd;
      }
    }
    if (group.length >= 2) groups.push(group);
  }

  // Assign lanes within each group.
  const assignments: LaneAssignment[] = [];
  for (const group of groups) {
    // Sort by arrow ID for deterministic ordering.
    const sorted = [...group].sort((a, b) => {
      if (a.arrowId !== b.arrowId) return a.arrowId.localeCompare(b.arrowId);
      return a.segmentIndex - b.segmentIndex;
    });

    // Deduplicate by arrowId — one lane per arrow in a corridor.
    const byArrow = new Map<string, LaneSegment>();
    for (const seg of sorted) {
      if (!byArrow.has(seg.arrowId)) {
        byArrow.set(seg.arrowId, seg);
      }
    }
    const unique = Array.from(byArrow.values());
    const clampedCount = Math.min(unique.length, maxLanes * 2 + 1);

    for (let idx = 0; idx < unique.length; idx += 1) {
      const lane = centeredLane(Math.min(idx, clampedCount - 1), clampedCount);
      // Dynamic spacing: slightly increase for dense groups.
      const spacing =
        laneSpacing * (1 + Math.min(0.5, (unique.length - 2) * 0.06));
      let offset = lane * spacing;
      // Grid snap for cleaner visual alignment.
      if (shouldSnap && Math.abs(offset) > 0.5) {
        offset = snapToGridValue(offset, gridSize);
        // Ensure non-zero offset stays non-zero after snapping.
        if (Math.abs(offset) < 0.5 && lane !== 0) {
          offset = lane > 0 ? gridSize : -gridSize;
        }
      }
      assignments.push({
        arrowId: unique[idx].arrowId,
        segmentIndex: unique[idx].segmentIndex,
        lane: Math.round(lane),
        offset,
      });
    }
  }

  return assignments;
};

/**
 * Apply lane offsets to routed paths.
 * Shifts the intermediate segments of each path by the assigned offset.
 */
export const applyLaneOffsets = (
  routes: Map<string, Point[]>,
  assignments: LaneAssignment[],
): Map<string, Point[]> => {
  // Group assignments by arrowId and pick the largest offset.
  const offsetByArrow = new Map<string, number>();
  for (const assignment of assignments) {
    const existing = offsetByArrow.get(assignment.arrowId) ?? 0;
    if (Math.abs(assignment.offset) > Math.abs(existing)) {
      offsetByArrow.set(assignment.arrowId, assignment.offset);
    }
  }

  const result = new Map<string, Point[]>();
  routes.forEach((points, arrowId) => {
    const offset = offsetByArrow.get(arrowId);
    if (!offset || Math.abs(offset) < 0.5 || points.length < 4) {
      result.set(arrowId, points);
      return;
    }

    // Determine dominant axis and shift inner segments.
    const shifted = points.map((p) => ({ ...p }));
    const start = shifted[0];
    const end = shifted[shifted.length - 1];
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const isHorizontalDominant = dx >= dy;

    // Shift only interior segments (preserve endpoint stubs).
    for (let i = 2; i < shifted.length - 2; i += 1) {
      if (isHorizontalDominant) {
        shifted[i] = { ...shifted[i], y: shifted[i].y + offset };
      } else {
        shifted[i] = { ...shifted[i], x: shifted[i].x + offset };
      }
    }

    // Crucially re-orthogonalize after the shift to fix the boundary segments (1-2 and end-3).
    result.set(arrowId, orthogonalizePath(shifted));
  });

  return result;
};

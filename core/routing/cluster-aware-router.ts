/**
 * Cluster-Aware Router – Route planning that respects domain clusters.
 *
 * When shapes are grouped into clusters (e.g., "Order Domain", "Payment Domain"),
 * this module generates waypoints that keep routes within cluster boundaries
 * when possible, and plan clean exit/entry paths when crossing clusters.
 *
 * Design principles:
 * - Same-cluster routes stay inside the cluster bounding box
 * - Cross-cluster routes exit via nearest edge, travel between clusters, enter target
 * - Avoids global spine lines that span the entire canvas
 * - Prefers step-wise routing over mega-trunk lines
 */

import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { Aabb, containsPoint } from "@/core/collision/aabb";

// ─────────────────── Types ───────────────────

export interface Cluster {
  id: string;
  bounds: Aabb;
  /** IDs of shapes that belong to this cluster. */
  memberIds: Set<string>;
}

export interface ClusterRoutingContext {
  clusters: Cluster[];
  /** Map from shape ID to cluster ID for fast lookup. */
  shapeClusterMap: Map<string, string>;
}

export interface ClusterWaypoints {
  /** Waypoints that guide the route to respect cluster boundaries. */
  waypoints: Point[];
  /** Whether source and target are in the same cluster. */
  sameCluster: boolean;
  /** Cluster ID of source shape, if any. */
  sourceClusterId: string | undefined;
  /** Cluster ID of target shape, if any. */
  targetClusterId: string | undefined;
}

// ─────────────────── Constants ───────────────────

/** Padding outside cluster bounds for exit/entry waypoints. */
const CLUSTER_EXIT_PADDING = 24;
/** Inset from cluster boundary for internal routing. */
const CLUSTER_INTERNAL_MARGIN = 16;

// ─────────────────── Context Builder ───────────────────

/**
 * Build a cluster routing context from raw cluster data.
 */
export const buildClusterContext = (
  clusters: Array<{ id: string; bounds: Aabb; memberIds: string[] }>,
): ClusterRoutingContext => {
  const clusterList: Cluster[] = clusters.map((c) => ({
    id: c.id,
    bounds: c.bounds,
    memberIds: new Set(c.memberIds),
  }));

  const shapeClusterMap = new Map<string, string>();
  for (const cluster of clusterList) {
    for (const memberId of cluster.memberIds) {
      shapeClusterMap.set(memberId, cluster.id);
    }
  }

  return { clusters: clusterList, shapeClusterMap };
};

/**
 * Auto-detect clusters from shape positions when no explicit clusters exist.
 * Groups shapes by spatial proximity using cluster bounding boxes.
 */
export const inferClustersFromBounds = (
  clusterBounds: Aabb[],
  shapePositions: Array<{ id: string; center: Point }>,
): ClusterRoutingContext => {
  const clusters: Cluster[] = clusterBounds.map((bounds, idx) => ({
    id: `auto-cluster-${idx}`,
    bounds,
    memberIds: new Set<string>(),
  }));

  // Assign shapes to clusters based on containment
  for (const shape of shapePositions) {
    for (const cluster of clusters) {
      if (containsPoint(cluster.bounds, shape.center)) {
        cluster.memberIds.add(shape.id);
        break;
      }
    }
  }

  const shapeClusterMap = new Map<string, string>();
  for (const cluster of clusters) {
    for (const memberId of cluster.memberIds) {
      shapeClusterMap.set(memberId, cluster.id);
    }
  }

  return { clusters, shapeClusterMap };
};

// ─────────────────── Waypoint Generation ───────────────────

/**
 * Find the nearest exit point from a cluster boundary for a given direction.
 */
const computeClusterExitPoint = (
  fromPoint: Point,
  toPoint: Point,
  cluster: Cluster,
): Point => {
  const bounds = cluster.bounds;
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  // Determine which edge to exit from based on direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal-dominant: exit from left or right edge
    if (dx > 0) {
      return { x: bounds.maxX + CLUSTER_EXIT_PADDING, y: fromPoint.y };
    }
    return { x: bounds.minX - CLUSTER_EXIT_PADDING, y: fromPoint.y };
  }

  // Vertical-dominant: exit from top or bottom edge
  if (dy > 0) {
    return { x: fromPoint.x, y: bounds.maxY + CLUSTER_EXIT_PADDING };
  }
  return { x: fromPoint.x, y: bounds.minY - CLUSTER_EXIT_PADDING };
};

/**
 * Find the nearest entry point into a cluster boundary.
 */
const computeClusterEntryPoint = (
  fromPoint: Point,
  toPoint: Point,
  cluster: Cluster,
): Point => {
  const bounds = cluster.bounds;
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      return { x: bounds.minX - CLUSTER_EXIT_PADDING, y: toPoint.y };
    }
    return { x: bounds.maxX + CLUSTER_EXIT_PADDING, y: toPoint.y };
  }

  if (dy > 0) {
    return { x: toPoint.x, y: bounds.minY - CLUSTER_EXIT_PADDING };
  }
  return { x: toPoint.x, y: bounds.maxY + CLUSTER_EXIT_PADDING };
};

/**
 * Generate waypoints for same-cluster routing.
 * Routes stay within the cluster, using intermediate points
 * that keep segments inside the cluster bounding box.
 */
const generateIntraClusterWaypoints = (
  start: Point,
  end: Point,
  cluster: Cluster,
): Point[] => {
  // For same-cluster, we just ensure the routing prefers staying inside.
  // No extra waypoints needed if both are inside—the scoring engine
  // will penalize any path that exits the cluster.

  // However, if the path between start and end would cross another cluster,
  // add a midpoint inside this cluster to guide routing.
  const midX = Math.max(
    cluster.bounds.minX + CLUSTER_INTERNAL_MARGIN,
    Math.min(
      cluster.bounds.maxX - CLUSTER_INTERNAL_MARGIN,
      (start.x + end.x) / 2,
    ),
  );
  const midY = Math.max(
    cluster.bounds.minY + CLUSTER_INTERNAL_MARGIN,
    Math.min(
      cluster.bounds.maxY - CLUSTER_INTERNAL_MARGIN,
      (start.y + end.y) / 2,
    ),
  );

  // Only add a waypoint if the midpoint is meaningfully different from endpoints
  const dist = Math.abs(midX - start.x) + Math.abs(midY - start.y);
  if (dist < CLUSTER_INTERNAL_MARGIN * 2) return [];

  return [{ x: midX, y: midY }];
};

/**
 * Generate waypoints for cross-cluster routing.
 * Exit source cluster → travel between clusters → enter target cluster.
 */
const generateInterClusterWaypoints = (
  start: Point,
  end: Point,
  sourceCluster: Cluster | undefined,
  targetCluster: Cluster | undefined,
): Point[] => {
  const waypoints: Point[] = [];

  if (sourceCluster) {
    waypoints.push(computeClusterExitPoint(start, end, sourceCluster));
  }

  if (targetCluster) {
    waypoints.push(computeClusterEntryPoint(start, end, targetCluster));
  }

  return waypoints;
};

// ─────────────────── Public API ───────────────────

/**
 * Generate cluster-aware waypoints for a route between two shapes.
 *
 * Pure and deterministic: same inputs always produce same output.
 */
export const generateClusterWaypoints = (
  start: Point,
  end: Point,
  sourceId: string | undefined,
  targetId: string | undefined,
  context: ClusterRoutingContext,
): ClusterWaypoints => {
  const sourceClusterId = sourceId
    ? context.shapeClusterMap.get(sourceId)
    : undefined;
  const targetClusterId = targetId
    ? context.shapeClusterMap.get(targetId)
    : undefined;

  const sourceCluster = sourceClusterId
    ? context.clusters.find((c) => c.id === sourceClusterId)
    : undefined;
  const targetCluster = targetClusterId
    ? context.clusters.find((c) => c.id === targetClusterId)
    : undefined;

  const sameCluster = !!(
    sourceClusterId &&
    targetClusterId &&
    sourceClusterId === targetClusterId
  );

  if (sameCluster && sourceCluster) {
    return {
      waypoints: generateIntraClusterWaypoints(start, end, sourceCluster),
      sameCluster: true,
      sourceClusterId,
      targetClusterId,
    };
  }

  return {
    waypoints: generateInterClusterWaypoints(
      start,
      end,
      sourceCluster,
      targetCluster,
    ),
    sameCluster: false,
    sourceClusterId,
    targetClusterId,
  };
};

/**
 * Check if a route violates any cluster boundaries it shouldn't cross.
 * Returns the number of unnecessary cluster intrusions.
 */
export const countClusterViolations = (
  path: Point[],
  sourceClusterId: string | undefined,
  targetClusterId: string | undefined,
  context: ClusterRoutingContext,
): number => {
  let violations = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const segMidX = (path[i].x + path[i + 1].x) / 2;
    const segMidY = (path[i].y + path[i + 1].y) / 2;
    const segMid: Point = { x: segMidX, y: segMidY };

    for (const cluster of context.clusters) {
      // Skip source and target clusters
      if (cluster.id === sourceClusterId || cluster.id === targetClusterId)
        continue;

      if (containsPoint(cluster.bounds, segMid)) {
        violations += 1;
        break; // Count max one violation per segment
      }
    }
  }

  return violations;
};

/**
 * routing-guards.ts
 *
 * Runtime type guards and invariant checkers for the routing pipeline.
 * Used to ensure defensive routing — no crash even under partial edge state.
 */

import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { RouteEngineEdge } from "@/core/routing/engines/route-engine";
import { RoutingObstacle } from "@/core/routing/algorithms/obstacle-avoidance";

// ─────────────────── Type Guards ───────────────────

/**
 * Verify that an object is a valid {x, y} point with finite number coordinates.
 */
export const isValidPoint = (obj: unknown): obj is Point => {
  if (typeof obj !== "object" || obj === null) return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p.x === "number" &&
    typeof p.y === "number" &&
    isFinite(p.x) &&
    isFinite(p.y)
  );
};

/**
 * Verify that a Point array is valid for routing (length >= 2, all entries valid).
 */
export const isValidPointArray = (
  points: unknown,
  minLength = 2,
): points is Point[] => {
  if (!Array.isArray(points) || points.length < minLength) return false;
  return points.every((p) => isValidPoint(p));
};

// ─────────────────── Edge Validation ───────────────────

/**
 * Validate a RouteEngineEdge for fully-connected routing.
 * Rejects edges where start/end points are missing or invalid.
 */
export const validateEdge = (edge: RouteEngineEdge): boolean => {
  if (!edge) return false;
  if (!isValidPoint(edge.start)) return false;
  if (!isValidPoint(edge.end)) return false;
  // arrowId must be a non-empty string
  if (typeof edge.arrowId !== "string" || edge.arrowId.length === 0)
    return false;
  return true;
};

/**
 * Validate that a RouteEngineEdge is fully connected (has both sourceId and targetId).
 * Used to skip edges that are mid-creation / in drag state.
 */
export const isFullyConnectedEdge = (edge: RouteEngineEdge): boolean => {
  return (
    validateEdge(edge) &&
    typeof edge.sourceId === "string" &&
    edge.sourceId.length > 0 &&
    typeof edge.targetId === "string" &&
    edge.targetId.length > 0
  );
};

/**
 * Filter out any invalid edges before routing.
 */
export const sanitizeEdges = (edges: RouteEngineEdge[]): RouteEngineEdge[] => {
  return edges.filter(validateEdge);
};

// ─────────────────── Obstacle Validation ───────────────────

/**
 * Validate that a RoutingObstacle has a finite, non-degenerate bounding box.
 */
export const validateObstacleBounds = (obstacle: RoutingObstacle): boolean => {
  if (!obstacle || !obstacle.bounds) return false;
  const { minX, minY, maxX, maxY } = obstacle.bounds;
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY))
    return false;
  if (maxX < minX || maxY < minY) return false;
  return true;
};

/**
 * Filter out any malformed obstacles before using them in routing.
 */
export const sanitizeObstacles = (
  obstacles: RoutingObstacle[],
): RoutingObstacle[] => {
  return obstacles.filter(validateObstacleBounds);
};

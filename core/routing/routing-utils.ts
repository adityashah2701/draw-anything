import { Point } from "@/features/whiteboard/types/whiteboard.types";

/**
 * Universal epsilon for floating-point drift tolerant geometry.
 */
export const EPSILON = 0.001;

/**
 * Check if two points are effectively the same within EPSILON.
 */
export const arePointsEqual = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

/**
 * Check if a segment is effectively horizontal or vertical.
 */
export const isOrthogonalSegment = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < EPSILON || Math.abs(a.y - b.y) < EPSILON;

/**
 * Check if a path consists entirely of effectively orthogonal segments.
 */
export const isOrthogonalPath = (points: Point[]): boolean => {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (!isOrthogonalSegment(points[i], points[i + 1])) return false;
  }
  return true;
};

/**
 * Compress an orthogonal path by removing collinear intermediate points
 * and duplicate adjacent points. Drift-tolerant.
 */
export const compressOrthogonalPath = (points: Point[]): Point[] => {
  if (points.length <= 2) return points;

  const deduped: Point[] = [];
  points.forEach((point) => {
    const last = deduped[deduped.length - 1];
    if (!last || !arePointsEqual(last, point)) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) return deduped;

  const compact: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const prev = compact[compact.length - 1];
    const current = deduped[i];
    const next = deduped[i + 1];

    const isCollinear =
      (Math.abs(prev.x - current.x) < EPSILON &&
        Math.abs(current.x - next.x) < EPSILON) ||
      (Math.abs(prev.y - current.y) < EPSILON &&
        Math.abs(current.y - next.y) < EPSILON);

    if (!isCollinear) {
      compact.push(current);
    }
  }
  compact.push(deduped[deduped.length - 1]);
  return compact;
};

/**
 * Force a path to be orthogonal by adding elbows to non-orthogonal segments.
 * Uses a preference for horizontal-then-vertical (hv) or vice-versa (vh).
 */
export const orthogonalizePath = (
  points: Point[],
  preference: "hv" | "vh" = "hv",
): Point[] => {
  if (points.length < 2) return points;
  const result: Point[] = [{ ...points[0] }];

  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1];
    const next = points[i];

    if (isOrthogonalSegment(prev, next)) {
      result.push({ ...next });
      continue;
    }

    const elbow =
      preference === "vh" ? { x: prev.x, y: next.y } : { x: next.x, y: prev.y };
    result.push(elbow, { ...next });
  }

  return compressOrthogonalPath(result);
};

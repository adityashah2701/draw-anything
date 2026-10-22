import type { Point } from "@/features/whiteboard/types/whiteboard.types";

/** Longest the curve is allowed to cut a corner short, in world units. */
const MAX_CORNER_REACH = 96;
/** Straight run kept at an attached end so the arrowhead (and the shape's edge) sit on a straight piece. */
const END_TAIL = 8;
const FLATTEN_STEPS = 10;

export interface CurveCorner {
  /** Where the curve leaves the incoming segment. */
  enter: Point;
  /** The polyline's own bend, used as the control point. */
  control: Point;
  /** Where the curve rejoins the outgoing segment. */
  exit: Point;
}

const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const lerp = (from: Point, to: Point, distance: number): Point => {
  const total = length(from, to);
  if (total === 0) return { ...from };
  const t = distance / total;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

/**
 * Smooths a routed polyline into a curve. Each bend is replaced by a quadratic arc that starts and ends on
 * the two segments around it, so the curve touches the original path only along its straight runs and the
 * ends keep their direction (an attached connector still leaves a shape square to its side).
 *
 * A segment between two bends gives each of them half its length, which turns a Z route into an S; a
 * segment that ends on the connector's own end gives the bend everything but a short straight tail.
 */
export const curveCorners = (points: readonly Point[]): CurveCorner[] => {
  const corners: CurveCorner[] = [];
  const last = points.length - 1;
  for (let i = 1; i < last; i += 1) {
    const [before, bend, after] = [points[i - 1], points[i], points[i + 1]];
    const incoming = length(before, bend);
    const outgoing = length(bend, after);
    const cross = (bend.x - before.x) * (after.y - bend.y) - (bend.y - before.y) * (after.x - bend.x);
    if (incoming === 0 || outgoing === 0 || Math.abs(cross) < 1e-6) continue;
    const room = (segment: number, otherEndIsBend: boolean) => (otherEndIsBend ? segment / 2 : Math.max(0, segment - END_TAIL));
    const reach = Math.min(MAX_CORNER_REACH, room(incoming, i - 1 > 0), room(outgoing, i + 1 < last));
    if (reach <= 0.5) continue;
    corners.push({ enter: lerp(bend, before, reach), control: { ...bend }, exit: lerp(bend, after, reach) });
  }
  return corners;
};

/** Traces `points` as a smooth path on a canvas context (coordinates already in the context's space). */
export const traceCurve = (ctx: CanvasRenderingContext2D, points: readonly Point[]) => {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (const corner of curveCorners(points)) {
    ctx.lineTo(corner.enter.x, corner.enter.y);
    ctx.quadraticCurveTo(corner.control.x, corner.control.y, corner.exit.x, corner.exit.y);
  }
  const end = points[points.length - 1];
  ctx.lineTo(end.x, end.y);
};

/** The curve as a plain polyline, for hit-testing and measuring. */
export const flattenCurve = (points: readonly Point[], steps = FLATTEN_STEPS): Point[] => {
  if (points.length < 3) return points.map((point) => ({ ...point }));
  const out: Point[] = [{ ...points[0] }];
  for (const { enter, control, exit } of curveCorners(points)) {
    out.push({ ...enter });
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const u = 1 - t;
      out.push({ x: u * u * enter.x + 2 * u * t * control.x + t * t * exit.x, y: u * u * enter.y + 2 * u * t * control.y + t * t * exit.y });
    }
    out.push({ ...exit });
  }
  out.push({ ...points[points.length - 1] });
  return out;
};

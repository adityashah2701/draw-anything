import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import { centerOf, makeBounds, normalizeDegrees, rotatePoint } from "@/core/geometry/box";

/** Smallest extent a scaled shape is allowed to shrink to, in world units. */
export const MIN_SCALED_EXTENT = 4;

interface AxisMap {
  scale: number;
  map: (v: number) => number;
}

const axis = (fromMin: number, fromSize: number, toMin: number, toSize: number): AxisMap => {
  // A zero-size source (a lone vertical line, say) cannot be scaled: it is only moved.
  const scale = fromSize > 1e-9 ? toSize / fromSize : 1;
  return { scale, map: (v) => toMin + (v - fromMin) * scale };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Map one shape from the box `from` onto the box `to`: position and size scale together, so the
 * shape keeps its place relative to everything else scaled by the same pair of boxes. This is the
 * one implementation group resize, multi-selection resize and the W/H fields share.
 *
 * Every shape is described by its `points`, so mapping them is the scale, with two exceptions that
 * are not plain point lists: a `circle` (centre + a point on its edge: keeps its centre mapped and
 * its radius scaled by the smaller factor so it stays a circle inside the box) and a `text` (a
 * single anchor plus a font size: the size follows only a uniform scale, so stretching a group does
 * not distort its text).
 */
export const scaleShape = (shape: DrawingElement, from: Bounds, to: Bounds): DrawingElement => {
  const x = axis(from.minX, from.width, to.minX, to.width);
  const y = axis(from.minY, from.height, to.minY, to.height);
  const mapPoint = (p: Point): Point => ({ x: x.map(p.x), y: y.map(p.y) });

  if (shape.type === "circle" && shape.points.length >= 2) {
    const [center, edge] = shape.points;
    const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
    const nextCenter = mapPoint(center);
    const nextRadius = radius * Math.min(Math.abs(x.scale), Math.abs(y.scale));
    const angle = Math.atan2(edge.y - center.y, edge.x - center.x);
    return {
      ...shape,
      points: [nextCenter, { x: nextCenter.x + Math.cos(angle) * nextRadius, y: nextCenter.y + Math.sin(angle) * nextRadius }],
    };
  }
  if (shape.type === "text") {
    const uniform = Math.abs(x.scale - y.scale) < 1e-6;
    return {
      ...shape,
      points: shape.points.map(mapPoint),
      ...(uniform && shape.fontSize ? { fontSize: Math.max(1, round2(shape.fontSize * x.scale)) } : {}),
    };
  }
  return { ...shape, points: shape.points.map(mapPoint) };
};

export const scaleShapes = (shapes: readonly DrawingElement[], from: Bounds, to: Bounds): DrawingElement[] =>
  shapes.map((shape) => scaleShape(shape, from, to));

/**
 * Smallest frame (as a fraction of the current one, per axis) that keeps every measurable shape at
 * least `floor` wide/high. Shapes already below the floor do not hold the frame back.
 */
export const minimumScale = (boxes: readonly Bounds[], floor = MIN_SCALED_EXTENT): { x: number; y: number } => {
  let x = 0;
  let y = 0;
  for (const b of boxes) {
    if (b.width > floor) x = Math.max(x, floor / b.width);
    if (b.height > floor) y = Math.max(y, floor / b.height);
  }
  return { x: Math.min(1, x), y: Math.min(1, y) };
};

/** `to`, grown just enough that it is no smaller than `minScale` times `from`, keeping the edges `anchor` names fixed. */
export const clampFrame = (
  from: Bounds,
  to: Bounds,
  minScale: { x: number; y: number },
  fixed: { left: boolean; top: boolean },
): Bounds => {
  const minW = from.width * minScale.x;
  const minH = from.height * minScale.y;
  let { minX, minY, maxX, maxY } = to;
  if (maxX - minX < minW) {
    if (fixed.left) maxX = minX + minW;
    else minX = maxX - minW;
  }
  if (maxY - minY < minH) {
    if (fixed.top) maxY = minY + minH;
    else minY = maxY - minH;
  }
  return makeBounds(minX, minY, maxX, maxY);
};

/**
 * Rotate `shape` by `degrees` about `pivot`. Point-described shapes with no orientation of their own
 * (lines, arrows, freehand) have their points rotated. Shapes that can carry a `rotation` move their
 * centre around the pivot and add to `rotation`, so a group turns as one rigid body. Anything else
 * (text, circle) only has its position carried around, since it has no visible orientation to turn.
 *
 * `localBounds` is the shape's *unrotated* box; `canRotate` says whether the shape honours `rotation`.
 */
export const rotateShape = (
  shape: DrawingElement,
  pivot: Point,
  degrees: number,
  localBounds: Bounds | null,
  canRotate: boolean,
): DrawingElement => {
  if (degrees === 0) return shape;
  const isPolyline = shape.type === "line" || shape.type === "arrow" || shape.type === "arrow-bidirectional" || shape.type === "freehand";
  if (isPolyline) return { ...shape, points: shape.points.map((p) => rotatePoint(p, pivot, degrees)) };
  if (!localBounds) return shape;

  const center = centerOf(localBounds);
  const moved = rotatePoint(center, pivot, degrees);
  const dx = moved.x - center.x;
  const dy = moved.y - center.y;
  const points = shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  if (!canRotate) return { ...shape, points };
  return { ...shape, points, rotation: normalizeDegrees((shape.rotation ?? 0) + degrees) };
};

type Connected = DrawingElement & {
  startConnection?: { elementId?: string };
  endConnection?: { elementId?: string };
};

const isConnector = (shape: DrawingElement) => shape.type === "arrow" || shape.type === "arrow-bidirectional";

/**
 * Split the connectors among `moving` shapes into those that can travel rigidly with them (every
 * attached end is on a shape that moves by the same amount) and those that must be re-routed instead
 * (an end is attached to something staying put, or moving differently). Rigid connectors keep their
 * bends exactly; the others go back to the router with their original geometry, so an arrow between
 * a moved shape and an unmoved one stays attached to both.
 *
 * `sameMotion(a, b)` says whether two moving shapes get the same displacement (default: they all do,
 * as in a drag). Align and distribute pass a comparison of the per-shape offsets.
 */
export const partitionConnectors = (
  moving: readonly DrawingElement[],
  sameMotion: (a: string, b: string) => boolean = () => true,
): { rigid: DrawingElement[]; reroute: DrawingElement[] } => {
  const ids = new Set(moving.map((shape) => shape.id));
  const rigid: DrawingElement[] = [];
  const reroute: DrawingElement[] = [];
  for (const shape of moving) {
    if (!isConnector(shape)) {
      rigid.push(shape);
      continue;
    }
    const { startConnection, endConnection } = shape as Connected;
    const ends = [startConnection?.elementId, endConnection?.elementId].filter((id): id is string => !!id);
    (ends.every((id) => ids.has(id) && sameMotion(shape.id, id)) ? rigid : reroute).push(shape);
  }
  return { rigid, reroute };
};

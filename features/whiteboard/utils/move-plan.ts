import { getShapeLocalBounds, getShapeRotation, isRotatable, moveShape } from "@/core/shapes/shape-runtime";
import { partitionConnectors, rotateShape, scaleShape } from "@/core/groups/transform";
import type { Offset } from "@/core/groups/units";
import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";

const sameOffset = (a: Offset | undefined, b: Offset | undefined) => !!a && !!b && a.dx === b.dx && a.dy === b.dy;

/**
 * Everything one transform writes: the shapes changed by `apply`, plus the connectors that must follow.
 *
 * A connector selected together with the shapes it joins is transformed with them (its bends stay
 * where the user left them). One that joins a transformed shape to something that stays put, or to a
 * shape that moves differently (`sameMotion`), is handed back to the router with its original
 * geometry instead, so it stays attached at both ends. `rerouteConnected` is the editor's
 * incremental router: it only looks at connectors attached to the shapes it is given.
 *
 * `origin` must be the shapes as they were before the gesture, so repeated calls with a growing
 * transform never accumulate error.
 */
export const planTransform = (
  origin: readonly DrawingElement[],
  apply: (shape: DrawingElement) => DrawingElement,
  rerouteConnected: (changed: DrawingElement[]) => DrawingElement[],
  sameMotion?: (a: string, b: string) => boolean,
): DrawingElement[] => {
  if (origin.length === 0) return [];
  const { rigid } = partitionConnectors(origin, sameMotion);
  const changed = rigid.map(apply);
  const changedIds = new Set(changed.map((shape) => shape.id));
  const followers = rerouteConnected(changed).filter((connector) => !changedIds.has(connector.id));
  return [...changed, ...followers];
};

/** Shapes moved by per-shape offsets (a drag, a nudge, align, distribute). Shapes without an offset stay. */
export const planShapeMoves = (
  origin: readonly DrawingElement[],
  offsets: ReadonlyMap<string, Offset>,
  rerouteConnected: (moved: DrawingElement[]) => DrawingElement[],
): DrawingElement[] =>
  planTransform(
    origin.filter((shape) => offsets.has(shape.id)),
    (shape) => {
      const offset = offsets.get(shape.id)!;
      return moveShape(shape, { x: offset.dx, y: offset.dy });
    },
    rerouteConnected,
    (a, b) => sameOffset(offsets.get(a), offsets.get(b)),
  );

/** The same offset for every shape: a plain drag or nudge. */
export const uniformOffsets = (shapes: readonly DrawingElement[], dx: number, dy: number): Map<string, Offset> =>
  new Map(shapes.map((shape) => [shape.id, { dx, dy }]));

/** Everything scaled from the box `from` onto the box `to` (frame resize, W/H fields). */
export const planFrameScale = (
  origin: readonly DrawingElement[],
  from: Bounds,
  to: Bounds,
  rerouteConnected: (changed: DrawingElement[]) => DrawingElement[],
): DrawingElement[] =>
  planTransform(origin, (shape) => scaleShape(shape, from, to, getShapeRotation(shape)), rerouteConnected);

/** Everything turned by `degrees` about `pivot`, as one rigid body. */
export const planRotation = (
  origin: readonly DrawingElement[],
  pivot: Point,
  degrees: number,
  getBounds: (shape: DrawingElement) => Bounds | null,
  rerouteConnected: (changed: DrawingElement[]) => DrawingElement[],
): DrawingElement[] =>
  planTransform(
    origin,
    (shape) => {
      const canRotate = isRotatable(shape.type);
      return rotateShape(shape, pivot, degrees, canRotate ? getShapeLocalBounds(shape) : getBounds(shape), canRotate);
    },
    rerouteConnected,
  );

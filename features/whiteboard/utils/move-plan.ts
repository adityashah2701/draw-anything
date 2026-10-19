import { moveShape } from "@/core/shapes/shape-runtime";
import { partitionConnectors } from "@/core/groups/transform";
import type { Offset } from "@/core/groups/units";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const sameOffset = (a: Offset | undefined, b: Offset | undefined) => !!a && !!b && a.dx === b.dx && a.dy === b.dy;

/**
 * Everything one move writes: the shapes moved by their offsets, plus the connectors that must follow.
 *
 * A connector selected together with the shapes it joins travels with them untouched (its bends are
 * exactly where the user left them). One that joins a moving shape to something that stays put, or
 * to a shape moving by a different amount (align and distribute), is handed back to the router with
 * its original geometry instead, so it stays attached at both ends. `rerouteConnected` is the
 * editor's incremental router: it only looks at connectors attached to the shapes it is given.
 *
 * `origin` must be the shapes as they were before the gesture, so repeated calls with a growing
 * offset never accumulate error.
 */
export const planShapeMoves = (
  origin: readonly DrawingElement[],
  offsets: ReadonlyMap<string, Offset>,
  rerouteConnected: (moved: DrawingElement[]) => DrawingElement[],
): DrawingElement[] => {
  const moving = origin.filter((shape) => offsets.has(shape.id));
  if (moving.length === 0) return [];
  const { rigid } = partitionConnectors(moving, (a, b) => sameOffset(offsets.get(a), offsets.get(b)));
  const moved = rigid.map((shape) => {
    const offset = offsets.get(shape.id)!;
    return moveShape(shape, { x: offset.dx, y: offset.dy });
  });
  const movedIds = new Set(moved.map((shape) => shape.id));
  const followers = rerouteConnected(moved).filter((connector) => !movedIds.has(connector.id));
  return [...moved, ...followers];
};

/** The same offset for every shape: a plain drag or nudge. */
export const uniformOffsets = (shapes: readonly DrawingElement[], dx: number, dy: number): Map<string, Offset> =>
  new Map(shapes.map((shape) => [shape.id, { dx, dy }]));

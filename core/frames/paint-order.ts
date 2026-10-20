import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { orderFramesBelowContents } from "./containment";

const memo = new WeakMap<readonly DrawingElement[], readonly DrawingElement[]>();

/**
 * The order to draw `shapes` in: the stacking order, except that a frame is always drawn before
 * (under) what it owns. The frame API already writes lists that way; this guards a board edited by an
 * older build, another client or a hand-written patch, so a frame can never paint over its contents.
 * Returns the same array when nothing needs to move (the usual case, and every board without frames),
 * and remembers its answer per array, so calling it on every repaint costs nothing.
 */
export const paintOrder = <T extends DrawingElement>(shapes: readonly T[]): readonly T[] => {
  const known = memo.get(shapes);
  if (known) return known as readonly T[];
  let result: readonly T[] = shapes;
  if (shapes.some((shape) => shape.type === "frame")) {
    const order = orderFramesBelowContents(shapes as unknown as StoredElement[]);
    if (order) {
      const byId = new Map<string, T>();
      for (const shape of shapes) if (!byId.has(shape.id)) byId.set(shape.id, shape);
      result = order.flatMap((id) => byId.get(id) ?? []);
    }
  }
  memo.set(shapes, result);
  return result;
};

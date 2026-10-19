import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { isGroupRecord } from "./group-index";

/**
 * The full stored order after the shapes have been re-stacked into `shapeOrder`.
 *
 * Group records have no stacking of their own, so they keep their slots; every other slot is
 * refilled with the shapes in their new order. Writing this (rather than the shape order alone)
 * keeps the length equal to the stored list, which the reorder mutation requires, and moves nothing
 * that did not have to move.
 */
export const storedOrderFromShapes = (stored: readonly StoredElement[], shapeOrder: readonly string[]): string[] => {
  const queue = [...shapeOrder];
  return stored.map((item) => (isGroupRecord(item) ? item.id : (queue.shift() ?? item.id)));
};

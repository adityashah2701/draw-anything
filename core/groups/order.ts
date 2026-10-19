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

/**
 * The moves that turn the list `current` into `wanted`, as `{ from, to }` index pairs applied one after
 * another, touching only the items that are out of place. Null when `wanted` is not a permutation of
 * `current` (a stale view of the list: the caller does nothing rather than scramble it).
 */
export const movesToOrder = (current: readonly string[], wanted: readonly string[]): Array<{ from: number; to: number }> | null => {
  if (wanted.length !== current.length || new Set(wanted).size !== wanted.length) return null;
  const known = new Set(current);
  if (!wanted.every((id) => known.has(id))) return null;
  const working = [...current];
  const moves: Array<{ from: number; to: number }> = [];
  wanted.forEach((id, target) => {
    const from = working.indexOf(id);
    if (from === target) return;
    moves.push({ from, to: target });
    working.splice(target, 0, working.splice(from, 1)[0]);
  });
  return moves;
};

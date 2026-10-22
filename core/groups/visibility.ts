import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { flaggedByFrame, ancestorsOf, type GroupIndex } from "./group-index";

type Connected = DrawingElement & {
  startConnection?: { elementId?: string };
  endConnection?: { elementId?: string };
};

const isConnector = (shape: DrawingElement) => shape.type === "arrow" || shape.type === "arrow-bidirectional";

/**
 * Whether a shape (or a group) is hidden: it carries `hidden`, or a group or a frame around it does. Hiding is a
 * property of the document, not a view setting, so it is saved, undone and seen by every collaborator.
 */
export const isHiddenByFlag = (index: GroupIndex, id: string): boolean => {
  const own = index.shapes.get(id)?.hidden ?? index.groups.get(id)?.hidden;
  if (own) return true;
  return ancestorsOf(index, id).some((ancestor) => index.groups.get(ancestor)?.hidden === true) || flaggedByFrame(index, id, "hidden");
};

/**
 * Whether a shape is out of sight right now: hidden itself, hidden through a group, or a connector with
 * a hidden end (a line to nothing would be a stray mark). Derived each time, never stored, so showing the
 * shape brings its connectors back with no bookkeeping.
 */
export const isEffectivelyHidden = (index: GroupIndex, id: string): boolean => {
  if (isHiddenByFlag(index, id)) return true;
  const shape = index.shapes.get(id);
  if (!shape || !isConnector(shape)) return false;
  const { startConnection, endConnection } = shape as Connected;
  return [startConnection?.elementId, endConnection?.elementId].some((end) => end !== undefined && index.shapes.has(end) && isHiddenByFlag(index, end));
};

/** The shapes the canvas draws, hit-tests and exports: everything not effectively hidden, in stacking order. */
export const visibleShapes = (shapes: readonly DrawingElement[], index: GroupIndex): DrawingElement[] => {
  let anyHidden = false;
  for (const shape of shapes) {
    if (shape.hidden) {
      anyHidden = true;
      break;
    }
  }
  if (!anyHidden && index.groups.size === 0) return shapes as DrawingElement[];
  const visible = shapes.filter((shape) => !isEffectivelyHidden(index, shape.id));
  return visible.length === shapes.length ? (shapes as DrawingElement[]) : visible;
};

/** Ids of the shapes that are hidden by a flag of their own or a group's (connectors hidden only by an end are not counted). */
export const hiddenShapeIds = (index: GroupIndex): string[] => [...index.shapes.keys()].filter((id) => isHiddenByFlag(index, id));

/** True when any stored item carries the flag, which is how the editor knows whether to offer "show all". */
export const hasHidden = (stored: readonly StoredElement[]): boolean => stored.some((item) => item.hidden === true);


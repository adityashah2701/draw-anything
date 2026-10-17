import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";

/** The element being drawn after the pointer moves to `point`; `endSnap` is the anchor a new connector end is snapped to. */
export const growDraftElement = (
  draft: DrawingElement,
  point: Point,
  endSnap: MagneticSnapMatch | null,
): DrawingElement => {
  if (draft.type === "freehand") {
    return { ...draft, points: [...draft.points, point] };
  }
  if (isArrowElement(draft)) {
    // Straight preview only: full routing runs when the arrow is committed.
    return {
      ...draft,
      points: [draft.points[0], endSnap ? { x: endSnap.anchor.x, y: endSnap.anchor.y } : point],
      endConnection: endSnap ? { elementId: endSnap.elementId, anchorId: endSnap.anchor.id } : undefined,
    };
  }
  return { ...draft, points: [draft.points[0], point] } as DrawingElement;
};

/** While an arrow end is being dragged only start and end are kept, as a straight preview that is routed on release. */
export const straightArrowPreview = <T extends { points: Point[] }>(arrow: T, fallback: Point): T & { isManuallyRouted: false } => {
  const start = arrow.points[0] ?? fallback;
  const end = arrow.points[Math.max(1, arrow.points.length - 1)] ?? start;
  return { ...arrow, points: [start, end], isManuallyRouted: false };
};

/** A drag shorter than this (world units, both axes) is a click, not a shape. */
const MIN_DRAWN_SIZE = 4;

export type DraftCommit = "click" | "connected-arrow" | "shape";

/** What releasing the pointer does with the element being drawn: nothing, a routed connector between two shapes, or a plain add. */
export const classifyDraftCommit = (draft: DrawingElement): DraftCommit => {
  const first = draft.points[0];
  const last = draft.points[draft.points.length - 1];
  const isClick =
    draft.type !== "freehand" && Math.abs(first.x - last.x) < MIN_DRAWN_SIZE && Math.abs(first.y - last.y) < MIN_DRAWN_SIZE;
  if (isClick) return "click";
  return isArrowElement(draft) && draft.startConnection && draft.endConnection ? "connected-arrow" : "shape";
};

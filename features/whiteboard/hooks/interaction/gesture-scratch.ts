import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { MagneticSnapMatch } from "@/core/snap/use-magnetic-snap";
import type { DragSession } from "./drag-session";

interface EndSnaps {
  start: MagneticSnapMatch | null;
  end: MagneticSnapMatch | null;
}

/**
 * Per-gesture working data that must not trigger a render. Everything is cleared together when a gesture
 * ends, is cancelled or is found stale, so no gesture can leave leftovers for the next one.
 */
export interface GestureScratch {
  dragSession: DragSession | null;
  /** The drag actually moved something (a plain click on a shape starts a drag session too). */
  dragMoved: boolean;
  /** A plain click on one member (a shape or a whole group) of a multi-selection: collapse to its shapes on release unless the pointer moved. */
  collapseOnRelease: { ids: string[]; origin: Point } | null;
  lastPoint: Point | null;
  resizeInitialBounds: Bounds | null;
  /** The element as it was when a resize began; every frame is computed from it. */
  resizeBase: DrawingElement | null;
  /** A group or multi-selection being resized from its frame: everything is computed from this snapshot. */
  frameResize: {
    handle: string;
    origin: DrawingElement[];
    content: Bounds;
    grab: Point;
    minScale: { x: number; y: number };
  } | null;
  lastResizePoint: Point | null;
  pendingArrowReroute: DrawingElement | null;
  /** Snap matches while an existing arrow end is being dragged. */
  previousSnap: EndSnaps;
  /** Shapes a new connector snapped to at each end while it is drawn. */
  arrowSnap: EndSnaps;
}

export const createScratch = (): GestureScratch => ({
  dragSession: null,
  dragMoved: false,
  collapseOnRelease: null,
  lastPoint: null,
  resizeInitialBounds: null,
  resizeBase: null,
  frameResize: null,
  lastResizePoint: null,
  pendingArrowReroute: null,
  previousSnap: { start: null, end: null },
  arrowSnap: { start: null, end: null },
});

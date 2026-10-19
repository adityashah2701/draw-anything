import type { Point } from "@/features/whiteboard/types/whiteboard.types";
import type { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { rotatePoint } from "@/core/geometry/box";

/** Half the side of the square a point handle can be grabbed in, in screen pixels. */
export const HANDLE_REACH_PX = 8;

/**
 * The name of the resize handle under `point`, in list order (so a corner listed before an edge wins where
 * they meet), or null. A point handle is grabbed within a square of `HANDLE_REACH_PX`; an edge handle with
 * a `span` along its whole length, in the handle's own (possibly rotated) frame.
 */
export const resizeHandleAt = (handles: readonly ShapeResizeHandle[], point: Point, zoom: number): string | null => {
  const reach = HANDLE_REACH_PX / (zoom > 0 ? zoom : 1);
  for (const handle of handles) {
    if (handle.span === undefined) {
      if (Math.abs(point.x - handle.x) <= reach && Math.abs(point.y - handle.y) <= reach) return handle.name;
      continue;
    }
    const local = handle.angle ? rotatePoint(point, handle, -handle.angle) : point;
    const along = handle.name === "n" || handle.name === "s" ? local.x - handle.x : local.y - handle.y;
    const across = handle.name === "n" || handle.name === "s" ? local.y - handle.y : local.x - handle.x;
    if (Math.abs(along) <= handle.span / 2 && Math.abs(across) <= reach) return handle.name;
  }
  return null;
};

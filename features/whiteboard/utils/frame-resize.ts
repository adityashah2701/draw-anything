import { makeBounds } from "@/core/geometry/box";
import { clampFrame } from "@/core/groups/transform";
import type { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { FRAME_PAD_PX } from "./selection-overlay";

export interface FrameResizeInput {
  /** The selection's content box when the gesture began. */
  content: Bounds;
  /** One of n, ne, e, se, s, sw, w, nw. */
  handle: string;
  /** Where the pointer is now (world). */
  pointer: Point;
  /** Pointer minus handle position at the press, so the handle does not jump to the pointer. */
  grab: Point;
  zoom: number;
  /** Smallest frame as a fraction of `content` per axis (`minimumScale`). */
  minScale: { x: number; y: number };
  /** Keep the width : height ratio (corner handles only). */
  keepAspect: boolean;
}

/**
 * The content box the selection should have when its frame handle is dragged to `pointer`. The
 * handle sits `FRAME_PAD_PX` outside the content, so the dragged edge is the handle position moved
 * back in by that much; the opposite edge never moves. The frame cannot be dragged smaller than
 * `minScale` (so no shape collapses) and is never flipped.
 */
export const resizeFrame = ({ content, handle, pointer, grab, zoom, minScale, keepAspect }: FrameResizeInput): Bounds => {
  const pad = FRAME_PAD_PX / zoom;
  const target = { x: pointer.x - grab.x, y: pointer.y - grab.y };
  let { minX, minY, maxX, maxY } = content;
  if (handle.includes("w")) minX = target.x + pad;
  if (handle.includes("e")) maxX = target.x - pad;
  if (handle.includes("n")) minY = target.y + pad;
  if (handle.includes("s")) maxY = target.y - pad;

  const fixed = { left: !handle.includes("w"), top: !handle.includes("n") };
  let next = clampFrame(content, makeBounds(minX, minY, maxX, maxY), minScale, fixed);

  const corner = handle.length === 2;
  if (keepAspect && corner && content.width > 1e-9 && content.height > 1e-9) {
    const sx = next.width / content.width;
    const sy = next.height / content.height;
    // Follow whichever axis the pointer moved further from the original size.
    const scale = Math.max(Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy, minScale.x, minScale.y);
    const width = content.width * scale;
    const height = content.height * scale;
    const left = fixed.left ? content.minX : content.maxX - width;
    const top = fixed.top ? content.minY : content.maxY - height;
    next = makeBounds(left, top, left + width, top + height);
  }
  return next;
};

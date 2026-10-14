import type { Point } from "@/features/whiteboard/types/whiteboard.types";

export interface BoxEdges {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const HANDLES = new Set(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

/**
 * Resize a box by dragging one of its eight handles to `point`.
 *
 * Only the edges the handle controls move. If the drag would shrink the box
 * below `min`, the dragged edge stops there and the opposite edge stays put.
 * (Each shape used to keep its own copy that instead pushed the opposite edge
 * along with the cursor, so a shape slid sideways when shrunk past its limit.)
 *
 * Returns null for an unknown handle.
 */
export const resizeBox = (
  box: BoxEdges,
  handle: string,
  point: Point,
  min: { width: number; height: number },
): BoxEdges | null => {
  if (!HANDLES.has(handle)) return null;
  let { minX, minY, maxX, maxY } = box;

  if (handle.includes("w")) minX = Math.min(point.x, maxX - min.width);
  if (handle.includes("e")) maxX = Math.max(point.x, minX + min.width);
  if (handle.includes("n")) minY = Math.min(point.y, maxY - min.height);
  if (handle.includes("s")) maxY = Math.max(point.y, minY + min.height);

  return { minX, minY, maxX, maxY };
};

/**
 * Same, for shapes whose handles sit on the stroke's outer edge: the box is
 * padded by half the stroke, resized, and un-padded again.
 */
export const resizePaddedBox = (
  box: BoxEdges,
  padding: number,
  handle: string,
  point: Point,
  minSize: number,
): BoxEdges | null => {
  const resized = resizeBox(
    {
      minX: box.minX - padding,
      minY: box.minY - padding,
      maxX: box.maxX + padding,
      maxY: box.maxY + padding,
    },
    handle,
    point,
    { width: minSize, height: minSize },
  );
  return resized && {
    minX: resized.minX + padding,
    minY: resized.minY + padding,
    maxX: resized.maxX - padding,
    maxY: resized.maxY - padding,
  };
};

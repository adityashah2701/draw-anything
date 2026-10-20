import type { Bounds, FrameShape, Point } from "@/features/whiteboard/types/whiteboard.types";
import type { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { resizeBox } from "@/core/shapes/base/resize-box";
import { frameBox, frameRegions, resolveFrame } from "@/core/frames/frame-model";

const within = (box: Bounds, point: Point, radius: number) =>
  point.x >= box.minX - radius && point.x <= box.maxX + radius && point.y >= box.minY - radius && point.y <= box.maxY + radius;

/**
 * A frame is picked by its header and its border only. Its interior belongs to the elements inside
 * it (and to the canvas when empty), so a click there selects the element under the cursor or starts
 * a marquee, never the whole frame.
 */
export const containsPointInFrame = (shape: FrameShape, point: Point, radius = 0): boolean => {
  const regions = frameRegions(shape);
  if (!regions) return false;
  const { box, header } = regions;
  if (header && within(header, point, radius)) return true;
  if (!within(box, point, radius)) return false;
  const band = Math.max(radius, (shape.strokeWidth || 1) / 2, 3);
  return point.x <= box.minX + band || point.x >= box.maxX - band || point.y <= box.minY + band || point.y >= box.maxY - band;
};

export const getFrameResizeHandles = (shape: FrameShape, bounds?: Bounds | null): ShapeResizeHandle[] => {
  const box = bounds ?? frameBox(shape);
  // An auto-fit frame is sized by its contents, so it offers no handles.
  if (!box || resolveFrame(shape).autoFit) return [];
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return [
    { name: "nw", x: box.minX, y: box.minY },
    { name: "n", x: cx, y: box.minY },
    { name: "ne", x: box.maxX, y: box.minY },
    { name: "e", x: box.maxX, y: cy },
    { name: "se", x: box.maxX, y: box.maxY },
    { name: "s", x: cx, y: box.maxY },
    { name: "sw", x: box.minX, y: box.maxY },
    { name: "w", x: box.minX, y: cy },
  ];
};

export const resizeFrameShape = (shape: FrameShape, handle: string, point: Point, originalBounds?: Bounds): FrameShape => {
  if (!originalBounds || resolveFrame(shape).autoFit) return shape;
  const { minWidth, minHeight } = resolveFrame(shape);
  const box = resizeBox(originalBounds, handle, point, { width: minWidth, height: minHeight });
  if (!box) return shape;
  return {
    ...shape,
    points: [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.maxY },
    ],
  };
};

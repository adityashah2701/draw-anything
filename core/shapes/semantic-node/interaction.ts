import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizeBox } from "@/core/shapes/base/resize-box";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { SemanticNodeShape } from "@/core/shapes/semantic-node/types";

const MIN_WIDTH = 96;
const MIN_HEIGHT = 56;

export const containsPointInSemanticNode = (
  shape: SemanticNodeShape,
  point: Point,
  radius = 0,
): boolean => {
  if (shape.points.length < 2) return false;
  const [start, end] = shape.points;
  const minX = Math.min(start.x, end.x) - radius;
  const maxX = Math.max(start.x, end.x) + radius;
  const minY = Math.min(start.y, end.y) - radius;
  const maxY = Math.max(start.y, end.y) + radius;
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
};

export const getSemanticNodeResizeHandles = (
  _shape: SemanticNodeShape,
  bounds?: Bounds | null,
): ShapeResizeHandle[] => {
  if (!bounds) return [];
  const { minX, minY, maxX, maxY } = bounds;
  return [
    { name: "nw", x: minX, y: minY },
    { name: "n", x: (minX + maxX) / 2, y: minY },
    { name: "ne", x: maxX, y: minY },
    { name: "e", x: maxX, y: (minY + maxY) / 2 },
    { name: "se", x: maxX, y: maxY },
    { name: "s", x: (minX + maxX) / 2, y: maxY },
    { name: "sw", x: minX, y: maxY },
    { name: "w", x: minX, y: (minY + maxY) / 2 },
  ];
};

export const resizeSemanticNode = (
  shape: SemanticNodeShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): SemanticNodeShape => {
  if (!originalBounds) return shape;

  const box = resizeBox(originalBounds, handle, point, {
    width: MIN_WIDTH,
    height: MIN_HEIGHT,
  });
  if (!box) return shape;

  return {
    ...shape,
    points: [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.maxY },
    ],
  };
};

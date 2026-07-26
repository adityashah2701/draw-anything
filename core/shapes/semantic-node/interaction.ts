import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
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

  let { minX, minY, maxX, maxY } = originalBounds;
  switch (handle) {
    case "nw":
      minX = point.x;
      minY = point.y;
      break;
    case "ne":
      maxX = point.x;
      minY = point.y;
      break;
    case "se":
      maxX = point.x;
      maxY = point.y;
      break;
    case "sw":
      minX = point.x;
      maxY = point.y;
      break;
    case "n":
      minY = point.y;
      break;
    case "s":
      maxY = point.y;
      break;
    case "e":
      maxX = point.x;
      break;
    case "w":
      minX = point.x;
      break;
    default:
      return shape;
  }

  if (maxX - minX < MIN_WIDTH) maxX = minX + MIN_WIDTH;
  if (maxY - minY < MIN_HEIGHT) maxY = minY + MIN_HEIGHT;

  return {
    ...shape,
    points: [
      { x: minX, y: minY },
      { x: maxX, y: maxY },
    ],
  };
};

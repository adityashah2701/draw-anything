import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import { resizeBox } from "@/core/shapes/base/resize-box";
import { ShapeResizeHandle } from "@/core/shapes/base/base-shape-definition";
import { semanticMinSize } from "@/core/shapes/semantic-node/layout";
import { SemanticNodeShape } from "@/core/shapes/semantic-node/types";

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

/**
 * Four visible corner handles, and the four edges as grab zones along their whole length (not drawn).
 * Edge handles used to sit on the edge midpoints, which is also where a connector starts, so on a
 * hovered shape the connector always won and an edge could never be dragged. As zones, an edge can be
 * grabbed anywhere along it except at that midpoint; the corners stay listed first, so they win where
 * they meet an edge. The canvas draws the visible ones and the pointer hit-tests all of them.
 */
export const getSemanticNodeResizeHandles = (
  _shape: SemanticNodeShape,
  bounds?: Bounds | null,
): ShapeResizeHandle[] => {
  if (!bounds) return [];
  const { minX, minY, maxX, maxY } = bounds;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return [
    { name: "nw", x: minX, y: minY },
    { name: "ne", x: maxX, y: minY },
    { name: "se", x: maxX, y: maxY },
    { name: "sw", x: minX, y: maxY },
    { name: "n", x: midX, y: minY, span: maxX - minX, visible: false },
    { name: "s", x: midX, y: maxY, span: maxX - minX, visible: false },
    { name: "e", x: maxX, y: midY, span: maxY - minY, visible: false },
    { name: "w", x: minX, y: midY, span: maxY - minY, visible: false },
  ];
};

export const resizeSemanticNode = (
  shape: SemanticNodeShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): SemanticNodeShape => {
  if (!originalBounds) return shape;

  // An older node already below the limit is not pushed up to it by merely grabbing a handle.
  const min = semanticMinSize(shape.nodeStyle);
  const box = resizeBox(originalBounds, handle, point, {
    width: Math.min(min.width, originalBounds.maxX - originalBounds.minX),
    height: Math.min(min.height, originalBounds.maxY - originalBounds.minY),
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

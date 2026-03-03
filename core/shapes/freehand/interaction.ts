import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  ShapeResizeHandle,
} from "@/core/shapes/base/base-shape-definition";
import { isPointNearPolyline } from "@/core/shapes/base/shape-geometry-utils";
import { FreehandShape } from "@/core/shapes/freehand/types";

export const containsPointInFreehand = (
  shape: FreehandShape,
  point: Point,
  radius = 0,
): boolean => {
  return isPointNearPolyline(point, shape.points, 8 + radius);
};

export const getFreehandResizeHandles = (
  _shape: FreehandShape,
): ShapeResizeHandle[] => [];

export const resizeFreehand = (
  shape: FreehandShape,
  _handle: string,
  _point: Point,
  _originalBounds?: Bounds,
): FreehandShape => shape;

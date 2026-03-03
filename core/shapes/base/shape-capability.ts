import {
  Bounds,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import { ResizeHandle } from "@/core/shapes/base/base-shape-definition";

export interface ShapeCapability<T extends DrawingElement> {
  id: string;
  onMove?: (shape: T, delta: Point) => T;
  onResize?: (
    shape: T,
    handle: ResizeHandle,
    point: Point,
    originalBounds?: Bounds,
  ) => T;
  validate?: (shape: T) => boolean;
}


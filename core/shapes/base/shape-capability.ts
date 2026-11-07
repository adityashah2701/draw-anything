import {
  Bounds,
  DrawingElement,
  Point,
} from "@/core/model";
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


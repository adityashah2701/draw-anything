import {
  Anchor,
  Bounds,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";

export type ResizeHandle = string;

export interface ShapeResizeHandle {
  name: string;
  x: number;
  y: number;
}

export interface ShapeHitTestOptions {
  radius?: number;
  bounds?: Bounds | null;
  zoom?: number;
}

export interface ShapeResizeHandleOptions {
  bounds?: Bounds | null;
  zoom?: number;
}

export interface ShapeRenderCanvasContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  panOffset: { x: number; y: number };
  getElementBounds: (
    element: DrawingElement,
  ) => { minX: number; minY: number; maxX: number; maxY: number } | null;
  editingTextId?: string | null;
}

export interface ShapeGeometryContext {
  textMeasureContext?: CanvasRenderingContext2D | null;
  zoom?: number;
}

export interface BaseShapeDefinition<T extends DrawingElement> {
  type: T["type"];
  capabilities?: readonly string[];
  create: (props: Partial<T>) => T;
  render: (shape: T) => unknown;
  renderToCanvas: (shape: T, context: ShapeRenderCanvasContext) => void;
  getBounds: (shape: T, context?: ShapeGeometryContext) => Bounds | null;
  getAnchors: (shape: T, bounds?: Bounds | null) => Anchor[];
  onMove?: (shape: T, delta: Point) => T;
  onResize?: (
    shape: T,
    handle: ResizeHandle,
    point: Point,
    originalBounds?: Bounds,
  ) => T;
  containsPoint?: (
    shape: T,
    point: Point,
    options?: ShapeHitTestOptions,
  ) => boolean;
  getResizeHandles?: (
    shape: T,
    options?: ShapeResizeHandleOptions,
  ) => ShapeResizeHandle[];
  validate?: (shape: T) => boolean;
}

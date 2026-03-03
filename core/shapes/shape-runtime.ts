import {
  Anchor,
  Bounds,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  ShapeHitTestOptions,
  ShapeResizeHandle,
  ShapeResizeHandleOptions,
  ShapeGeometryContext,
  ShapeRenderCanvasContext,
} from "@/core/shapes/base/base-shape-definition";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";

const registry = initializeShapeRegistry();

export const getShapeDefinition = (type: DrawingElement["type"]) =>
  registry.getUnsafe(type);

export const createShape = <TType extends DrawingElement["type"]>(
  type: TType,
  props?: Partial<DrawingElement>,
): Extract<DrawingElement, { type: TType }> | null => {
  const definition = registry.get(type);
  if (!definition) return null;
  return definition.create(
    (props ?? {}) as Partial<Extract<DrawingElement, { type: TType }>>,
  );
};

export const getShapeBounds = (
  shape: DrawingElement,
  context?: ShapeGeometryContext,
): Bounds | null => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return null;
  return definition.getBounds(shape, context);
};

export const getShapeAnchors = (
  shape: DrawingElement,
  bounds?: Bounds | null,
): Anchor[] => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return [];
  return definition.getAnchors(shape, bounds ?? definition.getBounds(shape));
};

export const moveShape = (
  shape: DrawingElement,
  delta: Point,
): DrawingElement => {
  const definition = getShapeDefinition(shape.type);
  if (!definition?.onMove) {
    return shape;
  }
  return definition.onMove(shape, delta);
};

export const resizeShape = (
  shape: DrawingElement,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): DrawingElement => {
  const definition = getShapeDefinition(shape.type);
  if (!definition?.onResize) return shape;
  return definition.onResize(shape, handle, point, originalBounds);
};

export const shapeContainsPoint = (
  shape: DrawingElement,
  point: Point,
  options?: ShapeHitTestOptions,
): boolean => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return false;

  if (definition.containsPoint) {
    return definition.containsPoint(shape, point, options);
  }

  const bounds =
    options?.bounds ?? definition.getBounds(shape, { zoom: options?.zoom });
  if (!bounds) return false;
  const radius = options?.radius ?? 0;
  return (
    point.x >= bounds.minX - radius &&
    point.x <= bounds.maxX + radius &&
    point.y >= bounds.minY - radius &&
    point.y <= bounds.maxY + radius
  );
};

export const getShapeResizeHandles = (
  shape: DrawingElement,
  options?: ShapeResizeHandleOptions,
): ShapeResizeHandle[] => {
  const definition = getShapeDefinition(shape.type);
  if (!definition?.getResizeHandles) return [];
  return definition.getResizeHandles(shape, options);
};

export const renderShapeToCanvas = (
  shape: DrawingElement,
  context: ShapeRenderCanvasContext,
) => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return;
  definition.renderToCanvas(shape, context);
};

import { createShapeDefinition } from "@/core/shapes/base/create-shape-definition";
import type { ShapeRenderCanvasContext } from "@/core/shapes/base/base-shape-definition";
import { connectable } from "@/core/shapes/capabilities/connectable";
import { movable } from "@/core/shapes/capabilities/movable";
import { resizable } from "@/core/shapes/capabilities/resizable";
import { getRectangleAnchors } from "@/core/shapes/rectangle/anchors";
import { getRectangleBounds } from "@/core/shapes/rectangle/geometry";
import { containsPointInRectangle, getRectangleResizeHandles, resizeRectangle } from "@/core/shapes/rectangle/interaction";
import type { RectangleShape } from "@/core/shapes/rectangle/types";
import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";

/**
 * The shared body of the structured box elements (entity table, classifier, mind-map topic, lifeline): a box with
 * a box's bounds, perimeter anchors, hit-testing and resizing, and a minimum size that follows its content. Each
 * element supplies what is its own: its defaults, its drawing and its minimum size.
 */
export interface BoxElementConfig<T extends DrawingElement> {
  type: T["type"];
  create: (props: Partial<T>) => T;
  render: (shape: T, context: ShapeRenderCanvasContext) => void;
  /** The smallest box that shows the content, in world units. */
  minSize: (shape: T) => { width: number; height: number };
}

const clampToMin = <T extends DrawingElement>(shape: T, min: { width: number; height: number }): T => {
  const [a, b] = shape.points;
  if (!a || !b) return shape;
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const w = Math.max(min.width, Math.abs(b.x - a.x)), h = Math.max(min.height, Math.abs(b.y - a.y));
  const points: Point[] = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 + h }];
  return { ...shape, points } as T;
};

export const boxDefinition = <T extends DrawingElement>(cfg: BoxElementConfig<T>) =>
  createShapeDefinition<T>({
    type: cfg.type,
    capabilities: [movable<T>(), resizable<T>(), connectable<T>((shape: T, bounds: Bounds | null) => getRectangleAnchors(shape as unknown as RectangleShape, bounds))],
    create: cfg.create as never,
    render: () => null,
    renderToCanvas: cfg.render as never,
    getBounds: (shape: T) => getRectangleBounds(shape as unknown as RectangleShape),
    getAnchors: (shape: T, bounds?: Bounds | null) => getRectangleAnchors(shape as unknown as RectangleShape, bounds ?? null),
    onResize: (shape: T, handle: string, point: Point, originalBounds?: Bounds) => clampToMin(resizeRectangle(shape as unknown as RectangleShape, handle, point, originalBounds) as unknown as T, cfg.minSize(shape)),
    containsPoint: (shape: T, point: Point, options?: { radius?: number }) => containsPointInRectangle(shape as unknown as RectangleShape, point, options?.radius ?? 0),
    getResizeHandles: (shape: T, options?: { bounds?: Bounds | null }) => getRectangleResizeHandles(shape as unknown as RectangleShape, options?.bounds),
    validate: (shape: T) => shape.points.length >= 2,
    propertiesConfig: { supportsColor: true, supportsFill: true, supportsStrokeWidth: true, supportsFontSize: false },
  } as never);

/** The world-unit box of a two-point element, normalised. */
export const boxOf = (shape: { points: Point[] }) => {
  const [a, b] = shape.points;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
};

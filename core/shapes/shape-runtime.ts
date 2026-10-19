import {
  Anchor,
  AnchorSide,
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
import { centerOf, normalizeDegrees, rotatedBoundsAabb, rotatePoint } from "@/core/geometry/box";

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

// ── Rotation ────────────────────────────────────────────────────────────────
// A rotated shape keeps its `points` as the unrotated box. Everything that reads geometry goes
// through this file, so rotation is applied here once: bounds are the axis-aligned box of the
// rotated shape (so snapping, routing obstacles, the minimap and fit all keep working unchanged),
// while hit-testing, anchors, resize handles and drawing use the real rotated shape.

/** Whether shapes of this type honour `rotation`. */
export const isRotatable = (type: DrawingElement["type"]): boolean =>
  getShapeDefinition(type)?.capabilities?.includes("rotatable") === true;

/** Degrees the shape is drawn rotated by, normalised to [0, 360); 0 for shapes that cannot rotate. */
export const getShapeRotation = (shape: DrawingElement): number =>
  isRotatable(shape.type) && typeof shape.rotation === "number" && Number.isFinite(shape.rotation)
    ? normalizeDegrees(shape.rotation)
    : 0;

/** The shape's box before rotation (what its `points` describe). */
export const getShapeLocalBounds = (
  shape: DrawingElement,
  context?: ShapeGeometryContext,
): Bounds | null => getShapeDefinition(shape.type)?.getBounds(shape, context) ?? null;

export const getShapeBounds = (
  shape: DrawingElement,
  context?: ShapeGeometryContext,
): Bounds | null => {
  const local = getShapeLocalBounds(shape, context);
  if (!local) return null;
  const rotation = getShapeRotation(shape);
  return rotation ? rotatedBoundsAabb(local, rotation) : local;
};

const SIDE_ANGLE: Record<AnchorSide, number> = { right: 0, bottom: 90, left: 180, top: 270 };
const SIDE_AT: AnchorSide[] = ["right", "bottom", "left", "top"];

/** The side an outward direction falls on after turning the shape: the nearest of the four. */
const rotatedSide = (side: AnchorSide, degrees: number): AnchorSide =>
  SIDE_AT[((Math.round((SIDE_ANGLE[side] + degrees) / 90) % 4) + 4) % 4];

export const getShapeAnchors = (
  shape: DrawingElement,
  bounds?: Bounds | null,
): Anchor[] => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return [];
  const rotation = getShapeRotation(shape);
  if (!rotation) return definition.getAnchors(shape, bounds ?? definition.getBounds(shape));

  // Anchors keep their ids (a connector stays on the same logical point when the shape turns) but
  // move with the outline, and report the side they now face so routes leave and arrive sensibly.
  const local = definition.getBounds(shape);
  if (!local) return [];
  const center = centerOf(local);
  return definition.getAnchors(shape, local).map((anchor) => {
    const moved = rotatePoint(anchor, center, rotation);
    return { ...anchor, x: moved.x, y: moved.y, side: rotatedSide(anchor.side, rotation) };
  });
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

/** Where the handle named `handle` sits on a box, and the point opposite it (the one a resize keeps fixed). */
const oppositeOf = (box: Bounds, handle: string): Point => {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const x = handle.includes("w") ? box.maxX : handle.includes("e") ? box.minX : cx;
  const y = handle.includes("n") ? box.maxY : handle.includes("s") ? box.minY : cy;
  return { x, y };
};

export const resizeShape = (
  shape: DrawingElement,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): DrawingElement => {
  const definition = getShapeDefinition(shape.type);
  if (!definition?.onResize) return shape;
  const rotation = getShapeRotation(shape);
  if (!rotation) return definition.onResize(shape, handle, point, originalBounds);

  // Resize in the shape's own frame (undo the rotation on the pointer), then slide the result so the
  // corner or edge opposite the handle has not moved on screen.
  const before = definition.getBounds(shape);
  if (!before) return shape;
  const centerBefore = centerOf(before);
  const resized = definition.onResize(shape, handle, rotatePoint(point, centerBefore, -rotation), before);
  const after = definition.getBounds(resized);
  if (!after) return shape;
  const fixedBefore = rotatePoint(oppositeOf(before, handle), centerBefore, rotation);
  const fixedAfter = rotatePoint(oppositeOf(after, handle), centerOf(after), rotation);
  const dx = fixedBefore.x - fixedAfter.x;
  const dy = fixedBefore.y - fixedAfter.y;
  return { ...resized, points: resized.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
};

export const shapeContainsPoint = (
  shape: DrawingElement,
  point: Point,
  options?: ShapeHitTestOptions,
): boolean => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return false;

  const rotation = getShapeRotation(shape);
  let probe = point;
  let probeOptions = options;
  if (rotation) {
    // Test the unrotated shape against the pointer turned back by the same angle.
    const local = definition.getBounds(shape, { zoom: options?.zoom });
    if (!local) return false;
    probe = rotatePoint(point, centerOf(local), -rotation);
    probeOptions = { ...options, bounds: local };
  }

  if (definition.containsPoint) {
    return definition.containsPoint(shape, probe, probeOptions);
  }

  const bounds =
    probeOptions?.bounds ?? definition.getBounds(shape, { zoom: probeOptions?.zoom });
  if (!bounds) return false;
  const radius = probeOptions?.radius ?? 0;
  return (
    probe.x >= bounds.minX - radius &&
    probe.x <= bounds.maxX + radius &&
    probe.y >= bounds.minY - radius &&
    probe.y <= bounds.maxY + radius
  );
};

export const getShapeResizeHandles = (
  shape: DrawingElement,
  options?: ShapeResizeHandleOptions,
): ShapeResizeHandle[] => {
  const definition = getShapeDefinition(shape.type);
  if (!definition?.getResizeHandles) return [];
  const rotation = getShapeRotation(shape);
  if (!rotation) return definition.getResizeHandles(shape, options);

  const local = definition.getBounds(shape);
  if (!local) return [];
  const center = centerOf(local);
  return definition
    .getResizeHandles(shape, { ...options, bounds: local })
    .map((handle) => ({ ...handle, ...rotatePoint(handle, center, rotation) }));
};

export const renderShapeToCanvas = (
  shape: DrawingElement,
  context: ShapeRenderCanvasContext,
) => {
  const definition = getShapeDefinition(shape.type);
  if (!definition) return;
  const rotation = getShapeRotation(shape);
  const local = rotation ? definition.getBounds(shape) : null;
  if (!rotation || !local) {
    definition.renderToCanvas(shape, context);
    return;
  }
  const { ctx, zoom, panOffset } = context;
  const cx = ((local.minX + local.maxX) / 2) * zoom + panOffset.x;
  const cy = ((local.minY + local.maxY) / 2) * zoom + panOffset.y;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  try {
    definition.renderToCanvas(shape, context);
  } finally {
    ctx.restore();
  }
};

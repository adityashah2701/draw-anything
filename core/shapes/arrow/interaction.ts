import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  compressPath,
  moveOrthogonalSegment,
  routeArrowPoints,
} from "@/core/routing/orthogonal-router";
import {
  ShapeResizeHandle,
} from "@/core/shapes/base/base-shape-definition";
import { isPointNearPolyline, screenTolerance } from "@/core/shapes/base/shape-geometry-utils";
import {
  ArrowElement,
  getArrowEditHandles,
} from "@/core/shapes/arrow/arrow-utils";
import { ArrowShape } from "@/core/shapes/arrow/types";
import { flattenCurve } from "@/core/routing/curve";
import { parseAnchorSide } from "@/core/anchors/anchor-geometry";

const getConnectionSide = (connection?: ArrowElement["startConnection"]) => {
  if (!connection) return undefined;
  if (connection.handle) return connection.handle;
  if (connection.anchorId) return parseAnchorSide(connection.anchorId) ?? undefined;
  return undefined;
};

export const containsPointInArrow = (
  shape: ArrowElement,
  point: Point,
  radius = 0,
  zoom = 1,
): boolean => {
  return isPointNearPolyline(point, shape.routingMode === "curved" ? flattenCurve(shape.points) : shape.points, screenTolerance(10, zoom) + radius);
};

export const getArrowResizeHandles = (shape: ArrowElement): ShapeResizeHandle[] => {
  return getArrowEditHandles(shape.points)
    .filter((handle) => handle.kind !== "bend")
    .map((handle) => ({
      name: handle.name,
      x: handle.point.x,
      y: handle.point.y,
    }));
};

/** Room kept between an anchor and the first bend, so the arrowhead and the shape's edge stay clear. */
const MIN_STUB = 12;

const OUTWARD_SIGN = { left: -1, right: 1, top: -1, bottom: 1 } as const;

/** `raw` kept on the outward side of `anchor` by at least MIN_STUB, along the axis the terminal segment runs on. */
const keepOutward = (anchor: Point, near: Point, handle: ReturnType<typeof getConnectionSide>, raw: number): number => {
  const horizontal = anchor.y === near.y;
  const sign = handle ? OUTWARD_SIGN[handle] : Math.sign((horizontal ? near.x - anchor.x : near.y - anchor.y) || 1);
  const origin = horizontal ? anchor.x : anchor.y;
  return sign > 0 ? Math.max(raw, origin + MIN_STUB) : Math.min(raw, origin - MIN_STUB);
};

/**
 * Drag of the first (or last) segment: move the lane it connects to along the segment's own axis, never
 * closer to the anchor than MIN_STUB and never to the wrong side of it. A single-bend path has no lane to
 * slide and is returned as it is.
 */
const slideTerminalLane = (points: Point[], atStart: boolean, point: Point, shape: ArrowElement): Point[] => {
  if (points.length < 4) return points;
  const n = points.length;
  // A Z path has one lane, shared by both terminal segments: it must respect both anchors.
  if (n === 4) return moveOrthogonalSegment(points, 1, clampLaneTarget(points, 1, point, shape));
  const [anchor, near] = atStart ? [points[0], points[1]] : [points[n - 1], points[n - 2]];
  const horizontal = anchor.y === near.y; // the terminal segment runs along x
  const handle = getConnectionSide(atStart ? shape.startConnection : shape.endConnection);
  const value = keepOutward(anchor, near, handle, horizontal ? point.x : point.y);

  const next = points.map((p) => ({ ...p }));
  const [i1, i2] = atStart ? [1, 2] : [n - 2, n - 3];
  if (horizontal) {
    next[i1].x = value;
    next[i2].x = value;
  } else {
    next[i1].y = value;
    next[i2].y = value;
  }
  return next;
};

/** An inner lane next to an endpoint keeps to the outward side of that endpoint's anchor, like the terminal segment itself. */
const clampLaneTarget = (points: Point[], segmentIndex: number, point: Point, shape: ArrowElement): Point => {
  const n = points.length;
  const target = { ...point };
  const apply = (anchor: Point, near: Point, handle: ReturnType<typeof getConnectionSide>) => {
    if (anchor.y === near.y) target.x = keepOutward(anchor, near, handle, target.x);
    else if (anchor.x === near.x) target.y = keepOutward(anchor, near, handle, target.y);
  };
  if (segmentIndex === 1) apply(points[0], points[1], getConnectionSide(shape.startConnection));
  if (segmentIndex === n - 3) apply(points[n - 1], points[n - 2], getConnectionSide(shape.endConnection));
  return target;
};

export const resizeArrowElement = <T extends ArrowElement>(
  shape: T,
  handle: string,
  point: Point,
  _originalBounds?: Bounds,
): T => {
  if (shape.points.length < 2) return shape;

  const nextPoints = shape.points.map((entry) => ({ ...entry }));
  const lastPointIndex = nextPoints.length - 1;
  let resizedPoints = nextPoints;

  if (handle === "start" || handle === "end") {
    if (handle === "start") {
      nextPoints[0] = { x: point.x, y: point.y };
    } else {
      nextPoints[lastPointIndex] = { x: point.x, y: point.y };
    }

    resizedPoints = routeArrowPoints({
      start: nextPoints[0],
      end: nextPoints[lastPointIndex],
      startHandle: getConnectionSide(shape.startConnection),
      endHandle: getConnectionSide(shape.endConnection),
      routePreference: shape.routePreference,
      routingMode: shape.routingMode ?? "orthogonal",
      existingPoints: nextPoints,
      preserveManualBends: Boolean(shape.isManuallyRouted),
    });
  } else if (handle.startsWith("segment-")) {
    const segmentIndex = Number(handle.split("-")[1]);
    const lastSegmentIndex = nextPoints.length - 2;
    let orthogonalPoints = nextPoints;

    if (
      !Number.isFinite(segmentIndex) ||
      (shape.routingMode ?? "orthogonal") === "straight" ||
      orthogonalPoints.length < 3
    ) {
      const start = orthogonalPoints[0];
      const end = orthogonalPoints[lastPointIndex];
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);

      if (dx >= dy) {
        orthogonalPoints = [
          start,
          { x: start.x, y: point.y },
          { x: end.x, y: point.y },
          end,
        ];
      } else {
        orthogonalPoints = [
          start,
          { x: point.x, y: start.y },
          { x: point.x, y: end.y },
          end,
        ];
      }
    } else if (segmentIndex === 0 || segmentIndex === lastSegmentIndex) {
      // A segment touching an endpoint cannot move sideways (it is pinned to the anchor and must stay
      // perpendicular to the shape's side). Dragging it slides the lane it leads to along its own axis.
      orthogonalPoints = slideTerminalLane(orthogonalPoints, segmentIndex === 0, point, shape);
    } else {
      orthogonalPoints = moveOrthogonalSegment(orthogonalPoints, segmentIndex, clampLaneTarget(orthogonalPoints, segmentIndex, point, shape));
    }

    resizedPoints = compressPath(orthogonalPoints);
  } else {
    return shape;
  }

  const manualEdit = handle.startsWith("segment-") || handle.startsWith("bend-");

  return {
    ...shape,
    points: resizedPoints,
    ...(manualEdit
      ? {
          routingMode: shape.routingMode === "curved" ? "curved" : "orthogonal",
          isManuallyRouted: true,
        }
      : {}),
  };
};

export const resizeArrow = (
  shape: ArrowShape,
  handle: string,
  point: Point,
  originalBounds?: Bounds,
): ArrowShape => resizeArrowElement(shape, handle, point, originalBounds);

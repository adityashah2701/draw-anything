import { Bounds, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  compressPath,
  moveOrthogonalSegment,
  routeArrowPoints,
} from "@/core/routing/engines/orthogonal-router";
import {
  ShapeResizeHandle,
} from "@/core/shapes/base/base-shape-definition";
import { isPointNearPolyline } from "@/core/shapes/base/shape-geometry-utils";
import {
  ArrowElement,
  getArrowEditHandles,
} from "@/core/shapes/arrow/arrow-utils";
import { ArrowShape } from "@/core/shapes/arrow/types";
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
): boolean => {
  return isPointNearPolyline(point, shape.points, 10 + radius);
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
    } else if (segmentIndex === 0 && orthogonalPoints.length >= 2) {
      const start = orthogonalPoints[0];
      const second = orthogonalPoints[1];
      if (start.x === second.x) {
        orthogonalPoints = [
          start,
          { x: point.x, y: start.y },
          { x: point.x, y: second.y },
          ...orthogonalPoints.slice(1),
        ];
      } else {
        orthogonalPoints = [
          start,
          { x: start.x, y: point.y },
          { x: second.x, y: point.y },
          ...orthogonalPoints.slice(1),
        ];
      }
    } else if (segmentIndex === lastSegmentIndex && orthogonalPoints.length >= 2) {
      const penultimate = orthogonalPoints[lastPointIndex - 1];
      const end = orthogonalPoints[lastPointIndex];
      if (penultimate.x === end.x) {
        orthogonalPoints = [
          ...orthogonalPoints.slice(0, lastPointIndex),
          { x: point.x, y: penultimate.y },
          { x: point.x, y: end.y },
          end,
        ];
      } else {
        orthogonalPoints = [
          ...orthogonalPoints.slice(0, lastPointIndex),
          { x: penultimate.x, y: point.y },
          { x: end.x, y: point.y },
          end,
        ];
      }
    } else {
      orthogonalPoints = moveOrthogonalSegment(orthogonalPoints, segmentIndex, point);
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
          routingMode: "orthogonal",
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

import type { ArrowRoutePreference, ConnectionHandle, Point } from "@/features/whiteboard/types/whiteboard.types";
import {
  compressOrthogonalPath,
  isOrthogonalPath,
  orthogonalizePath,
} from "@/core/routing/routing-utils";

export const getFallbackOrthogonalPath = (
  start: Point,
  end: Point,
  preference: ArrowRoutePreference = "hv",
): Point[] => {
  if (start.x === end.x || start.y === end.y) return [start, end];
  if (preference === "vh") {
    return [start, { x: start.x, y: end.y }, end];
  }
  return [start, { x: end.x, y: start.y }, end];
};

const getHandleDirection = (handle: ConnectionHandle): Point => {
  switch (handle) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
};

export const pinPathEndpointStubs = (
  points: Point[],
  start: Point,
  end: Point,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
  stubDistance = 24,
  preference: ArrowRoutePreference = "hv",
): Point[] => {
  if (points.length < 4 || (!startHandle && !endHandle)) {
    return points;
  }

  // Distance along the handle's ray at which `point` lies, or null if it is not on that ray.
  const distanceAlongRay = (origin: Point, dir: Point, point: Point) => {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = dx * dir.x + dy * dir.y;
    const across = Math.abs(dx * dir.y) + Math.abs(dy * dir.x);
    return across < 0.5 && along > 0.5 ? along : null;
  };

  const pinned = points.map((point) => ({ ...point }));
  if (startHandle) {
    const dir = getHandleDirection(startHandle);
    const startExit = {
      x: start.x + dir.x * stubDistance,
      y: start.y + dir.y * stubDistance,
    };
    pinned[0] = { ...start };
    const along = distanceAlongRay(start, dir, pinned[1]);
    if (along === null) {
      // The next point is a real bend, not the stub: keep it and add the stub in front of it.
      pinned.splice(1, 0, startExit);
    } else if (along < stubDistance) {
      pinned[1] = startExit; // stub too short: extend it
    } // else the first segment already leaves the handle by at least the stub: keep it
  }

  if (endHandle) {
    const dir = getHandleDirection(endHandle);
    const endEntry = {
      x: end.x + dir.x * stubDistance,
      y: end.y + dir.y * stubDistance,
    };
    const endIndex = pinned.length - 1;
    pinned[endIndex] = { ...end };
    const along = distanceAlongRay(end, dir, pinned[endIndex - 1]);
    if (along === null) {
      pinned.splice(endIndex, 0, endEntry);
    } else if (along < stubDistance) {
      pinned[endIndex - 1] = endEntry;
    }
  }

  return orthogonalizePath(pinned, preference);
};

export const stabilizeArrowRouteEndpoints = (
  points: Point[],
  start: Point,
  end: Point,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
  preference?: ArrowRoutePreference,
): Point[] =>
  compressOrthogonalPath(
    pinPathEndpointStubs(
      points,
      start,
      end,
      startHandle,
      endHandle,
      undefined,
      preference ??
        (startHandle
          ? startHandle === "top" || startHandle === "bottom"
            ? "hv"
            : "vh"
          : endHandle
            ? endHandle === "top" || endHandle === "bottom"
              ? "vh"
              : "hv"
            : "hv"),
    ),
  );

export const reanchorPathEndpoints = (
  points: Point[],
  start: Point,
  end: Point,
): Point[] => {
  if (points.length <= 2) return [start, end];

  const oldStart = points[0];
  const oldSecond = points[1];
  const oldPrevToEnd = points[points.length - 2];
  const oldEnd = points[points.length - 1];

  const next = points.map((point) => ({ ...point }));
  next[0] = { ...start };
  next[next.length - 1] = { ...end };

  if (oldSecond.x === oldStart.x) {
    next[1] = { ...next[1], x: start.x };
  } else {
    next[1] = { ...next[1], y: start.y };
  }

  const penultimate = next.length - 2;
  if (oldPrevToEnd.x === oldEnd.x) {
    next[penultimate] = { ...next[penultimate], x: end.x };
  } else {
    next[penultimate] = { ...next[penultimate], y: end.y };
  }

  const compressed = compressOrthogonalPath(next);
  if (compressed.length >= 2 && isOrthogonalPath(compressed)) {
    return compressed;
  }

  return getFallbackOrthogonalPath(start, end);
};


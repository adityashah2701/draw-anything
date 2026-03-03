import {
  ArrowRoutePreference,
  ArrowRoutingMode,
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";

const STUB_DISTANCE = 24;

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const isVerticalHandle = (handle?: ConnectionHandle) =>
  handle === "top" || handle === "bottom";

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

const offsetByHandle = (point: Point, handle: ConnectionHandle): Point => {
  const dir = getHandleDirection(handle);
  return {
    x: point.x + dir.x * STUB_DISTANCE,
    y: point.y + dir.y * STUB_DISTANCE,
  };
};

const areCollinear = (a: Point, b: Point, c: Point) =>
  (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);

export const compressPath = (points: Point[]): Point[] => {
  if (points.length <= 2) return points;

  const deduped: Point[] = [];
  points.forEach((point) => {
    const last = deduped[deduped.length - 1];
    if (!last || !samePoint(last, point)) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) return deduped;

  const compact: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const prev = compact[compact.length - 1];
    const current = deduped[i];
    const next = deduped[i + 1];
    if (!areCollinear(prev, current, next)) {
      compact.push(current);
    }
  }
  compact.push(deduped[deduped.length - 1]);
  return compact;
};

const getDefaultPreference = (
  start: Point,
  end: Point,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
): ArrowRoutePreference => {
  if (startHandle) {
    return isVerticalHandle(startHandle) ? "vh" : "hv";
  }
  if (endHandle) {
    return isVerticalHandle(endHandle) ? "hv" : "vh";
  }
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx > dy ? "hv" : "vh";
};

const connectOrthogonally = (
  from: Point,
  to: Point,
  preference: ArrowRoutePreference,
): Point[] => {
  if (from.x === to.x || from.y === to.y) {
    return [to];
  }

  if (preference === "vh") {
    return [{ x: from.x, y: to.y }, to];
  }

  return [{ x: to.x, y: from.y }, to];
};

interface OrthogonalRouteInput {
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
  routePreference?: ArrowRoutePreference;
}

export const getOrthogonalPath = ({
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
}: OrthogonalRouteInput): Point[] => {
  const startExit = startHandle ? offsetByHandle(start, startHandle) : start;
  const endEntry = endHandle ? offsetByHandle(end, endHandle) : end;

  const preference =
    routePreference ??
    getDefaultPreference(start, end, startHandle, endHandle);

  const path: Point[] = [start];
  if (startHandle) path.push(startExit);
  path.push(...connectOrthogonally(startExit, endEntry, preference));
  if (endHandle && !samePoint(path[path.length - 1], endEntry)) {
    path.push(endEntry);
  }
  path.push(end);

  return compressPath(path);
};

interface RouteArrowInput extends OrthogonalRouteInput {
  routingMode?: ArrowRoutingMode;
  existingPoints?: Point[];
  preserveManualBends?: boolean;
}

export const routeArrowPoints = ({
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
  routingMode = "orthogonal",
  existingPoints,
  preserveManualBends = false,
}: RouteArrowInput): Point[] => {
  if (routingMode === "straight") {
    return [start, end];
  }

  if (preserveManualBends && existingPoints && existingPoints.length > 2) {
    return reanchorPathEndpoints(existingPoints, start, end);
  }

  return getOrthogonalPath({
    start,
    end,
    startHandle,
    endHandle,
    routePreference,
  });
};

export const isOrthogonalPath = (points: Point[]): boolean => {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x !== b.x && a.y !== b.y) {
      return false;
    }
  }
  return true;
};

export const reanchorPathEndpoints = (
  points: Point[],
  start: Point,
  end: Point,
): Point[] => {
  if (points.length <= 2) {
    return [start, end];
  }

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

  const penultimateIndex = next.length - 2;
  if (oldPrevToEnd.x === oldEnd.x) {
    next[penultimateIndex] = { ...next[penultimateIndex], x: end.x };
  } else {
    next[penultimateIndex] = { ...next[penultimateIndex], y: end.y };
  }

  const compressed = compressPath(next);
  if (compressed.length >= 2 && isOrthogonalPath(compressed)) {
    return compressed;
  }

  return getOrthogonalPath({ start, end });
};

export const insertBendPoint = (
  points: Point[],
  segmentIndex: number,
): Point[] => {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) {
    return points;
  }

  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  return [
    ...points.slice(0, segmentIndex + 1),
    midpoint,
    ...points.slice(segmentIndex + 1),
  ];
};

export const removeBendPoint = (
  points: Point[],
  bendIndex: number,
): Point[] => {
  if (points.length <= 2 || bendIndex <= 0 || bendIndex >= points.length - 1) {
    return points;
  }

  const next = [...points];
  next.splice(bendIndex, 1);
  return compressPath(next);
};

export const moveOrthogonalSegment = (
  points: Point[],
  segmentIndex: number,
  target: Point,
): Point[] => {
  const lastSegment = points.length - 2;
  if (
    points.length < 3 ||
    segmentIndex <= 0 ||
    segmentIndex >= lastSegment
  ) {
    return points;
  }

  const next = points.map((point) => ({ ...point }));
  const from = next[segmentIndex];
  const to = next[segmentIndex + 1];

  if (from.y === to.y) {
    const nextY = target.y;
    next[segmentIndex] = { ...next[segmentIndex], y: nextY };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], y: nextY };
  } else {
    const nextX = target.x;
    next[segmentIndex] = { ...next[segmentIndex], x: nextX };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], x: nextX };
  }

  return compressPath(next);
};


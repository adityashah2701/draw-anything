import {
  ArrowRoutePreference,
  ArrowRoutingMode,
  ConnectionHandle,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  computeParallelOffsets,
  ParallelEdgeDescriptor,
} from "@/core/routing/parallel-edge-manager";
import {
  ObstacleAwareRouteInput,
  compressOrthogonalPath,
  getObstacleAwareOrthogonalPath,
  PathRankingConfig,
  RoutingObstacle,
} from "@/core/routing/obstacle-avoidance";
import {
  addPathToSegmentSpatialIndex,
  buildSegmentSpatialIndex,
  countPathCrossingsWithSpatialIndex,
  resolvePathSegmentConflicts,
  SegmentConflictOptions,
  SegmentSpatialIndex,
} from "@/core/routing/segment-conflict-resolver";

const isOrthogonalSegment = (a: Point, b: Point) => a.x === b.x || a.y === b.y;

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const getDominantAxis = (start: Point, end: Point): "horizontal" | "vertical" =>
  Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
    ? "horizontal"
    : "vertical";

const applyParallelOffset = (
  points: Point[],
  start: Point,
  end: Point,
  offset: number,
  lockEndpointStubs: boolean,
): Point[] => {
  if (Math.abs(offset) < 0.001 || points.length <= 2) return points;

  const dominantAxis = getDominantAxis(start, end);
  const shifted = points.map((point) => ({ ...point }));
  const fromIndex = lockEndpointStubs ? 2 : 1;
  const toIndexExclusive = lockEndpointStubs
    ? Math.max(shifted.length - 2, fromIndex)
    : shifted.length - 1;

  for (let i = fromIndex; i < toIndexExclusive; i += 1) {
    if (dominantAxis === "horizontal") {
      shifted[i] = { ...shifted[i], y: shifted[i].y + offset };
    } else {
      shifted[i] = { ...shifted[i], x: shifted[i].x + offset };
    }
  }

  return compressOrthogonalPath(shifted);
};

const isOrthogonalPathInternal = (points: Point[]): boolean => {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (!isOrthogonalSegment(points[i], points[i + 1])) {
      return false;
    }
  }
  return true;
};

const getFallbackOrthogonalPath = (
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

const orthogonalizePath = (
  points: Point[],
  preference: ArrowRoutePreference = "hv",
): Point[] => {
  if (points.length < 2) return points;
  const result: Point[] = [{ ...points[0] }];

  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1];
    const next = points[i];
    if (prev.x === next.x || prev.y === next.y) {
      result.push({ ...next });
      continue;
    }

    const elbow =
      preference === "vh"
        ? { x: prev.x, y: next.y }
        : { x: next.x, y: prev.y };
    result.push(elbow, { ...next });
  }

  return compressOrthogonalPath(result);
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

const pinPathEndpointStubs = (
  points: Point[],
  start: Point,
  end: Point,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
  stubDistance = 24,
): Point[] => {
  if (points.length < 4 || (!startHandle && !endHandle)) {
    return points;
  }

  const pinned = points.map((point) => ({ ...point }));
  if (startHandle) {
    const dir = getHandleDirection(startHandle);
    const startExit = {
      x: start.x + dir.x * stubDistance,
      y: start.y + dir.y * stubDistance,
    };
    pinned[0] = { ...start };
    pinned[1] = startExit;
  }

  if (endHandle) {
    const dir = getHandleDirection(endHandle);
    const endEntry = {
      x: end.x + dir.x * stubDistance,
      y: end.y + dir.y * stubDistance,
    };
    const endIndex = pinned.length - 1;
    const penultimateIndex = pinned.length - 2;
    pinned[endIndex] = { ...end };
    pinned[penultimateIndex] = endEntry;
  }

  return orthogonalizePath(pinned);
};

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
  if (compressed.length >= 2 && isOrthogonalPathInternal(compressed)) {
    return compressed;
  }

  return getFallbackOrthogonalPath(start, end);
};

export interface RouteArrowInput
  extends Pick<
    ObstacleAwareRouteInput,
    | "start"
    | "end"
    | "startHandle"
    | "endHandle"
    | "routePreference"
    | "obstacles"
    | "ignoreObstacleIds"
    | "obstaclePadding"
  > {
  arrowId?: string;
  sourceId?: string;
  targetId?: string;
  routingMode?: ArrowRoutingMode;
  existingPoints?: Point[];
  preserveManualBends?: boolean;
  parallelOffset?: number;
  occupiedSegments?: SegmentSpatialIndex | null;
  conflictOptions?: SegmentConflictOptions;
  pathRanking?: PathRankingWeights;
}

export interface RouteArrowDescriptor {
  arrowId: string;
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
  routePreference?: ArrowRoutePreference;
  routingMode?: ArrowRoutingMode;
  existingPoints?: Point[];
  preserveManualBends?: boolean;
  sourceId?: string;
  targetId?: string;
}

export interface RouteArrowBatchInput {
  arrows: RouteArrowDescriptor[];
  obstacles?: RoutingObstacle[];
  existingRoutes?: Array<{ arrowId: string; points: Point[] }>;
  allParallelCandidates?: ParallelEdgeDescriptor[];
  obstaclePadding?: number;
  parallelSpacing?: number;
  conflictOptions?: SegmentConflictOptions;
  pathRanking?: PathRankingWeights;
}

export interface PathRankingWeights extends PathRankingConfig {
  crossingPenalty?: number;
}

export const routeArrowPoints = ({
  arrowId = "arrow",
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
  sourceId,
  targetId,
  routingMode = "orthogonal",
  existingPoints,
  preserveManualBends = false,
  obstacles = [],
  ignoreObstacleIds,
  obstaclePadding = 12,
  parallelOffset = 0,
  occupiedSegments = null,
  conflictOptions,
  pathRanking,
}: RouteArrowInput): Point[] => {
  if (routingMode === "straight") {
    return [start, end];
  }

  if (preserveManualBends && existingPoints && existingPoints.length > 2) {
    return reanchorPathEndpoints(existingPoints, start, end);
  }

  const ignoreIds = new Set<string>(ignoreObstacleIds ?? []);
  const lockEndpointStubs = Boolean(startHandle || endHandle);
  const crossingPenalty = pathRanking?.crossingPenalty ?? 0;
  const candidatePenalty =
    occupiedSegments && crossingPenalty > 0
      ? (candidate: Point[]) =>
          countPathCrossingsWithSpatialIndex(arrowId, candidate, occupiedSegments) *
          crossingPenalty
      : undefined;

  let points = getObstacleAwareOrthogonalPath({
    start,
    end,
    startHandle,
    endHandle,
    routePreference,
    obstacles,
    ignoreObstacleIds: Array.from(ignoreIds),
    obstaclePadding,
    candidatePenalty,
    pathRanking,
  });
  points = orthogonalizePath(
    points,
    routePreference ?? (startHandle === "top" || startHandle === "bottom" ? "vh" : "hv"),
  );

  points = applyParallelOffset(
    points,
    start,
    end,
    parallelOffset,
    lockEndpointStubs,
  );
  points = orthogonalizePath(
    points,
    routePreference ?? (startHandle === "top" || startHandle === "bottom" ? "vh" : "hv"),
  );
  points = pinPathEndpointStubs(points, start, end, startHandle, endHandle);
  points = resolvePathSegmentConflicts({
    arrowId,
    path: points,
    occupiedSegments,
    obstacles,
    ignoreObstacleIds: Array.from(ignoreIds),
    obstaclePadding,
    options: conflictOptions,
  });
  points = pinPathEndpointStubs(points, start, end, startHandle, endHandle);
  points = orthogonalizePath(
    points,
    routePreference ?? (startHandle === "top" || startHandle === "bottom" ? "vh" : "hv"),
  );

  return compressOrthogonalPath(points);
};

export const routeArrowBatch = ({
  arrows,
  obstacles = [],
  existingRoutes = [],
  allParallelCandidates,
  obstaclePadding = 12,
  parallelSpacing = 12,
  conflictOptions,
  pathRanking,
}: RouteArrowBatchInput): Map<string, Point[]> => {
  if (arrows.length === 0) return new Map<string, Point[]>();

  const parallelInputs: ParallelEdgeDescriptor[] =
    allParallelCandidates ??
    arrows.map((arrow) => ({
      arrowId: arrow.arrowId,
      sourceId: arrow.sourceId,
      targetId: arrow.targetId,
      start: arrow.start,
      end: arrow.end,
      startHandle: arrow.startHandle,
      endHandle: arrow.endHandle,
    }));

  const offsets = computeParallelOffsets(parallelInputs, parallelSpacing);
  const occupied = buildSegmentSpatialIndex(existingRoutes);
  const routed = new Map<string, Point[]>();

  const stableOrder = [...arrows].sort((a, b) => a.arrowId.localeCompare(b.arrowId));
  stableOrder.forEach((arrow) => {
    const points = routeArrowPoints({
      arrowId: arrow.arrowId,
      start: arrow.start,
      end: arrow.end,
      startHandle: arrow.startHandle,
      endHandle: arrow.endHandle,
      routePreference: arrow.routePreference,
      sourceId: arrow.sourceId,
      targetId: arrow.targetId,
      routingMode: arrow.routingMode ?? "orthogonal",
      existingPoints: arrow.existingPoints,
      preserveManualBends: Boolean(arrow.preserveManualBends),
      obstacles,
      obstaclePadding,
      parallelOffset: offsets.get(arrow.arrowId) ?? 0,
      occupiedSegments: occupied,
      conflictOptions,
      pathRanking,
    });
    routed.set(arrow.arrowId, points);
    addPathToSegmentSpatialIndex(occupied, arrow.arrowId, points);
  });

  return routed;
};

export const isOrthogonalPathStrict = isOrthogonalPathInternal;

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
  return compressOrthogonalPath(next);
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
    next[segmentIndex] = { ...next[segmentIndex], y: target.y };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], y: target.y };
  } else if (from.x === to.x) {
    next[segmentIndex] = { ...next[segmentIndex], x: target.x };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], x: target.x };
  }
  return compressOrthogonalPath(next);
};

export const getOrthogonalPath = ({
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
}: {
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
  routePreference?: ArrowRoutePreference;
}): Point[] =>
  routeArrowPoints({
    start,
    end,
    startHandle,
    endHandle,
    routePreference,
  });

export const compressPath = compressOrthogonalPath;

export const isOrthogonalPath = (points: Point[]) => isOrthogonalPathStrict(points);

export const pathHasDuplicateNeighborPoints = (points: Point[]) => {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (samePoint(points[i], points[i + 1])) return true;
  }
  return false;
};

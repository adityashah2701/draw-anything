import {
  ArrowRoutePreference,
  ConnectionHandle,
} from "@/features/whiteboard/types/whiteboard.types";
import { Point } from "@/features/whiteboard/types/whiteboard.types";
import { compressOrthogonalPath } from "@/core/routing/utils/routing-utils";
import {
  Aabb,
  expandAabb,
  intersectsAabb,
  pathIntersectsAabb,
  segmentBounds,
} from "@/core/collision/aabb";

export interface RoutingObstacle {
  id: string;
  bounds: Aabb;
}

export interface ObstacleAwareRouteInput {
  start: Point;
  end: Point;
  startHandle?: ConnectionHandle;
  endHandle?: ConnectionHandle;
  routePreference?: ArrowRoutePreference;
  obstacles?: RoutingObstacle[];
  ignoreObstacleIds?: string[];
  obstaclePadding?: number;
  stubDistance?: number;
  candidatePenalty?: (points: Point[]) => number;
  pathRanking?: PathRankingConfig;
}

export interface PathRankingConfig {
  bendPenalty?: number;
  lengthPenalty?: number;
  detourPenalty?: number;
  preferencePenalty?: number;
  crossingPenalty?: number;
}

const DEFAULT_STUB_DISTANCE = 24;
const DEFAULT_OBSTACLE_PADDING = 12;
const DEFAULT_BEND_PENALTY = 1000;
const DEFAULT_LENGTH_PENALTY = 1;
const DEFAULT_DETOUR_PENALTY = 0.15;
const DEFAULT_PREFERENCE_PENALTY = 48;

const isVerticalHandle = (handle?: ConnectionHandle) =>
  handle === "top" || handle === "bottom";

const getDefaultPreference = (
  start: Point,
  end: Point,
  startHandle?: ConnectionHandle,
  endHandle?: ConnectionHandle,
): ArrowRoutePreference => {
  if (startHandle) return isVerticalHandle(startHandle) ? "vh" : "hv";
  if (endHandle) return isVerticalHandle(endHandle) ? "hv" : "vh";
  return Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? "hv" : "vh";
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

const offsetByHandle = (
  point: Point,
  handle: ConnectionHandle,
  distance: number,
): Point => {
  const dir = getHandleDirection(handle);
  return {
    x: point.x + dir.x * distance,
    y: point.y + dir.y * distance,
  };
};

const connectOrthogonally = (
  from: Point,
  to: Point,
  preference: ArrowRoutePreference,
): Point[] => {
  if (from.x === to.x || from.y === to.y) return [to];
  if (preference === "vh") return [{ x: from.x, y: to.y }, to];
  return [{ x: to.x, y: from.y }, to];
};

const getPathLength = (points: Point[]) => {
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    length += Math.abs(points[i + 1].x - points[i].x);
    length += Math.abs(points[i + 1].y - points[i].y);
  }
  return length;
};

const getBendCount = (points: Point[]) => Math.max(0, points.length - 2);

const getDetourPenalty = (points: Point[], start: Point, end: Point) => {
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  let maxDeviation = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    maxDeviation = Math.max(
      maxDeviation,
      Math.abs(point.x - centerX) + Math.abs(point.y - centerY),
    );
  }
  return maxDeviation;
};

export const pathIntersectsObstacles = (
  points: Point[],
  obstacles: RoutingObstacle[],
  ignoreIds: Set<string>,
  padding: number,
): boolean => {
  const pathBounds = getPathBounds(points);
  if (!pathBounds) return false;
  for (const obstacle of obstacles) {
    if (ignoreIds.has(obstacle.id)) continue;
    const expanded = expandAabb(obstacle.bounds, padding);
    if (!intersectsAabb(pathBounds, expanded)) continue;
    if (pathIntersectsAabb(points, expanded, true)) {
      return true;
    }
  }
  return false;
};

const getBlockingObstacles = (
  points: Point[],
  obstacles: RoutingObstacle[],
  ignoreIds: Set<string>,
  padding: number,
): RoutingObstacle[] => {
  const pathBounds = getPathBounds(points);
  if (!pathBounds) return [];
  const blockers: RoutingObstacle[] = [];
  for (const obstacle of obstacles) {
    if (ignoreIds.has(obstacle.id)) continue;
    const expanded = expandAabb(obstacle.bounds, padding);
    if (!intersectsAabb(pathBounds, expanded)) continue;
    if (pathIntersectsAabb(points, expanded, true)) {
      blockers.push(obstacle);
    }
  }
  return blockers;
};

const routeViaX = (from: Point, to: Point, viaX: number): Point[] => [
  from,
  { x: viaX, y: from.y },
  { x: viaX, y: to.y },
  to,
];

const routeViaY = (from: Point, to: Point, viaY: number): Point[] => [
  from,
  { x: from.x, y: viaY },
  { x: to.x, y: viaY },
  to,
];

const scoreCandidate = (
  points: Point[],
  start: Point,
  end: Point,
  preferred: ArrowRoutePreference,
  pathRanking: PathRankingConfig,
  candidatePenalty?: (points: Point[]) => number,
): number => {
  const firstLeg: ArrowRoutePreference =
    points.length > 1 && points[0].x === points[1].x ? "vh" : "hv";
  const bendPenalty = pathRanking.bendPenalty ?? DEFAULT_BEND_PENALTY;
  const lengthPenalty = pathRanking.lengthPenalty ?? DEFAULT_LENGTH_PENALTY;
  const detourPenalty = pathRanking.detourPenalty ?? DEFAULT_DETOUR_PENALTY;
  const preferencePenaltyWeight =
    pathRanking.preferencePenalty ?? DEFAULT_PREFERENCE_PENALTY;
  const preferencePenalty =
    firstLeg === preferred ? 0 : preferencePenaltyWeight;
  const dynamicPenalty = candidatePenalty ? candidatePenalty(points) : 0;
  return (
    getBendCount(points) * bendPenalty +
    getPathLength(points) * lengthPenalty +
    getDetourPenalty(points, start, end) * detourPenalty +
    preferencePenalty +
    dynamicPenalty
  );
};

const collectCandidateLanes = (
  blockers: RoutingObstacle[],
  padding: number,
): { xLanes: number[]; yLanes: number[] } => {
  const xLaneSet = new Set<number>();
  const yLaneSet = new Set<number>();

  blockers.forEach((obstacle) => {
    xLaneSet.add(obstacle.bounds.minX - padding);
    xLaneSet.add(obstacle.bounds.maxX + padding);
    yLaneSet.add(obstacle.bounds.minY - padding);
    yLaneSet.add(obstacle.bounds.maxY + padding);
  });

  return {
    xLanes: Array.from(xLaneSet.values()),
    yLanes: Array.from(yLaneSet.values()),
  };
};

const wrapWithHandles = (
  start: Point,
  end: Point,
  startExit: Point,
  endEntry: Point,
  spine: Point[],
): Point[] =>
  compressOrthogonalPath([start, startExit, ...spine, endEntry, end]);

const getSpine = (
  startExit: Point,
  endEntry: Point,
  preference: ArrowRoutePreference,
): Point[] => [
  startExit,
  ...connectOrthogonally(startExit, endEntry, preference),
];

export const getObstacleAwareOrthogonalPath = ({
  start,
  end,
  startHandle,
  endHandle,
  routePreference,
  obstacles = [],
  ignoreObstacleIds = [],
  obstaclePadding = DEFAULT_OBSTACLE_PADDING,
  stubDistance = DEFAULT_STUB_DISTANCE,
  candidatePenalty,
  pathRanking = {},
}: ObstacleAwareRouteInput): Point[] => {
  const startExit = startHandle
    ? offsetByHandle(start, startHandle, stubDistance)
    : start;
  const endEntry = endHandle
    ? offsetByHandle(end, endHandle, stubDistance)
    : end;

  const preferred =
    routePreference ?? getDefaultPreference(start, end, startHandle, endHandle);
  const secondary: ArrowRoutePreference = preferred === "hv" ? "vh" : "hv";

  const ignoreIds = new Set(ignoreObstacleIds);
  const baseCandidates: Point[][] = [
    wrapWithHandles(
      start,
      end,
      startExit,
      endEntry,
      getSpine(startExit, endEntry, preferred),
    ),
    wrapWithHandles(
      start,
      end,
      startExit,
      endEntry,
      getSpine(startExit, endEntry, secondary),
    ),
  ];

  // Midpoint-via candidates: route through the midpoint of source/target.
  const midX = (startExit.x + endEntry.x) / 2;
  const midY = (startExit.y + endEntry.y) / 2;
  baseCandidates.push(
    wrapWithHandles(
      start,
      end,
      startExit,
      endEntry,
      routeViaX(startExit, endEntry, midX),
    ),
  );
  baseCandidates.push(
    wrapWithHandles(
      start,
      end,
      startExit,
      endEntry,
      routeViaY(startExit, endEntry, midY),
    ),
  );

  const blockers = getBlockingObstacles(
    baseCandidates[0],
    obstacles,
    ignoreIds,
    obstaclePadding,
  );
  if (blockers.length > 0) {
    const lanes = collectCandidateLanes(blockers, obstaclePadding);
    lanes.xLanes.forEach((xLane) => {
      baseCandidates.push(
        wrapWithHandles(
          start,
          end,
          startExit,
          endEntry,
          routeViaX(startExit, endEntry, xLane),
        ),
      );
    });
    lanes.yLanes.forEach((yLane) => {
      baseCandidates.push(
        wrapWithHandles(
          start,
          end,
          startExit,
          endEntry,
          routeViaY(startExit, endEntry, yLane),
        ),
      );
    });

    // U-turn candidates for fully blocked paths: go wide around obstacles.
    const allBounds = blockers.map((b) => b.bounds);
    const globalMinX =
      Math.min(...allBounds.map((b) => b.minX)) - obstaclePadding * 2;
    const globalMaxX =
      Math.max(...allBounds.map((b) => b.maxX)) + obstaclePadding * 2;
    const globalMinY =
      Math.min(...allBounds.map((b) => b.minY)) - obstaclePadding * 2;
    const globalMaxY =
      Math.max(...allBounds.map((b) => b.maxY)) + obstaclePadding * 2;
    baseCandidates.push(
      wrapWithHandles(
        start,
        end,
        startExit,
        endEntry,
        routeViaX(startExit, endEntry, globalMinX),
      ),
    );
    baseCandidates.push(
      wrapWithHandles(
        start,
        end,
        startExit,
        endEntry,
        routeViaX(startExit, endEntry, globalMaxX),
      ),
    );
    baseCandidates.push(
      wrapWithHandles(
        start,
        end,
        startExit,
        endEntry,
        routeViaY(startExit, endEntry, globalMinY),
      ),
    );
    baseCandidates.push(
      wrapWithHandles(
        start,
        end,
        startExit,
        endEntry,
        routeViaY(startExit, endEntry, globalMaxY),
      ),
    );
  }

  let best = baseCandidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  baseCandidates.forEach((candidate) => {
    if (candidate.length < 2) return;
    if (
      pathIntersectsObstacles(candidate, obstacles, ignoreIds, obstaclePadding)
    ) {
      return;
    }
    const score = scoreCandidate(
      candidate,
      start,
      end,
      preferred,
      pathRanking,
      candidatePenalty,
    );
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  // Multi-level fallback if every candidate intersects:
  if (bestScore === Number.POSITIVE_INFINITY) {
    // Level 1: Try with expanded padding (50% more clearance).
    const expandedPadding = obstaclePadding * 1.5;
    const expandedBlockers = getBlockingObstacles(
      baseCandidates[0],
      obstacles,
      ignoreIds,
      expandedPadding,
    );
    if (expandedBlockers.length > 0) {
      const expandedLanes = collectCandidateLanes(
        expandedBlockers,
        expandedPadding,
      );
      const expandedCandidates: Point[][] = [];
      expandedLanes.xLanes.forEach((xLane) => {
        expandedCandidates.push(
          wrapWithHandles(
            start,
            end,
            startExit,
            endEntry,
            routeViaX(startExit, endEntry, xLane),
          ),
        );
      });
      expandedLanes.yLanes.forEach((yLane) => {
        expandedCandidates.push(
          wrapWithHandles(
            start,
            end,
            startExit,
            endEntry,
            routeViaY(startExit, endEntry, yLane),
          ),
        );
      });

      expandedCandidates.forEach((candidate) => {
        if (candidate.length < 2) return;
        if (
          pathIntersectsObstacles(
            candidate,
            obstacles,
            ignoreIds,
            obstaclePadding,
          )
        )
          return;
        const score = scoreCandidate(
          candidate,
          start,
          end,
          preferred,
          pathRanking,
          candidatePenalty,
        );
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      });
    }
  }

  // Level 2: Accept the best intersecting candidate (least-cost) as last resort.
  if (bestScore === Number.POSITIVE_INFINITY) {
    best = [...baseCandidates].sort(
      (a, b) =>
        scoreCandidate(
          a,
          start,
          end,
          preferred,
          pathRanking,
          candidatePenalty,
        ) -
        scoreCandidate(b, start, end, preferred, pathRanking, candidatePenalty),
    )[0];
  }

  return compressOrthogonalPath(best);
};

export const getPathBounds = (points: Point[]): Aabb | null => {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
};

export const getSegmentBoundsWithPadding = (
  from: Point,
  to: Point,
  padding: number,
): Aabb => expandAabb(segmentBounds(from, to), padding);

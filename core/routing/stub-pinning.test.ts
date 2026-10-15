import { describe, expect, it } from "vitest";
import { routeArrowPoints, stabilizeArrowRouteEndpoints } from "./orthogonal-router";
import { getObstacleAwareOrthogonalPath, pathIntersectsObstacles } from "./obstacle-avoidance";

describe("endpoint stub pinning keeps real bends", () => {
  // Found by the layout benchmark: with only four points, the second-to-last point is a bend, not
  // the stub, and was overwritten with the stub point. The whole horizontal run then jumped to the
  // end of the path and the connector dived straight through the nodes of every row in between.
  const start = { x: 684, y: 909 };
  const end = { x: 415, y: 1623 };

  it("does not move a bend that merely sits near the end", () => {
    const path = [start, { x: 684, y: 943 }, { x: 415, y: 943 }, end];
    const pinned = stabilizeArrowRouteEndpoints(path, start, end, "bottom", "top", "vh");
    expect(pinned).toEqual(path);
  });

  it("absorbs a too-short stub on the handle's ray without creating a spurious bend", () => {
    const short = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 200 }];
    const pinned = stabilizeArrowRouteEndpoints(short, { x: 0, y: 0 }, { x: 80, y: 200 }, "bottom", "top", "vh");
    expect(pinned).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 200 }]);
  });

  it("keeps a long first segment instead of cutting it back to the stub length", () => {
    const long = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 200 }];
    const pinned = stabilizeArrowRouteEndpoints(long, { x: 0, y: 0 }, { x: 80, y: 200 }, "bottom", "top", "vh");
    expect(pinned).toEqual(long);
  });

  it("routeArrowPoints around an obstacle in the column stays clear of it end to end", () => {
    const obstacles = [{ id: "mid", bounds: { minX: 600, minY: 1100, maxX: 770, maxY: 1300 } }];
    const route = routeArrowPoints({
      arrowId: "a", start, end, startHandle: "bottom", endHandle: "top", routePreference: "vh",
      obstacles, ignoreObstacleIds: [], obstaclePadding: 18,
    });
    expect(pathIntersectsObstacles(route, obstacles, new Set(), 0)).toBe(false);
  });
});

describe("the router's search step", () => {
  it("finds a clear path when every fixed path shape is blocked", () => {
    // Obstacles in two different rows block any single-lane Z/U path from top to bottom.
    const obstacles = [
      { id: "a", bounds: { minX: -140, minY: 120, maxX: 40, maxY: 200 } },
      { id: "b", bounds: { minX: 60, minY: 120, maxX: 240, maxY: 200 } },
      { id: "c", bounds: { minX: -240, minY: 300, maxX: -40, maxY: 380 } },
      { id: "d", bounds: { minX: -20, minY: 300, maxX: 220, maxY: 380 } },
    ];
    const route = getObstacleAwareOrthogonalPath({
      start: { x: 20, y: 0 }, end: { x: 20, y: 520 }, startHandle: "bottom", endHandle: "top",
      routePreference: "vh", obstacles, obstaclePadding: 12,
    });
    expect(pathIntersectsObstacles(route, obstacles, new Set(), 0)).toBe(false);
  });
});

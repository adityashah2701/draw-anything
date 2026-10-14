import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeRoutes } from "@/core/routing/path-normalizer";
import { createCrossingCounter, countTotalCrossings } from "@/core/routing/crossing-minimizer";
import {
  pathIntersectsObstacles,
  type RoutingObstacle,
} from "@/core/routing/obstacle-avoidance";
import type { Point } from "@/features/whiteboard/types/whiteboard.types";

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

interface Scenario {
  routes: Map<string, Point[]>;
  obstacles: RoutingObstacle[];
  ignore: Map<string, Set<string>>;
}

/**
 * Synthetic *pre-normalization* routes: off-grid bends, 1px drift, routes that
 * clip obstacles and routes that cross each other. This exercises every revert
 * branch in isSafeTransform (obstacle hit, endpoint move, crossing increase).
 */
const buildScenario = (seed: number, cols: number, arrows: number): Scenario => {
  const rand = mulberry32(seed);
  const obstacles: RoutingObstacle[] = [];
  for (let i = 0; i < cols * cols; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    obstacles.push({
      id: `n${i}`,
      bounds: { minX: c * 200, minY: r * 140, maxX: c * 200 + 100, maxY: r * 140 + 60 },
    });
  }
  const routes = new Map<string, Point[]>();
  const ignore = new Map<string, Set<string>>();
  const jitter = () => (rand() < 0.3 ? (rand() - 0.5) * 3 : 0);
  for (let a = 0; a < arrows; a += 1) {
    const s = Math.floor(rand() * obstacles.length);
    let t = Math.floor(rand() * obstacles.length);
    if (t === s) t = (t + 1) % obstacles.length;
    const sb = obstacles[s].bounds;
    const tb = obstacles[t].bounds;
    const p0 = { x: sb.maxX, y: (sb.minY + sb.maxY) / 2 };
    const p3 = { x: tb.minX, y: (tb.minY + tb.maxY) / 2 };
    const midX = Math.round(rand() * cols * 200 * 10) / 10;
    const midY = Math.round(rand() * cols * 140 * 10) / 10;
    const shape = Math.floor(rand() * 3);
    const pts: Point[] =
      shape === 0
        ? [p0, { x: midX, y: p0.y + jitter() }, { x: midX + jitter(), y: p3.y }, p3]
        : shape === 1
          ? [p0, { x: p0.x + 7, y: p0.y }, { x: p0.x + 7, y: midY }, { x: p3.x - 5, y: midY + jitter() }, { x: p3.x - 5, y: p3.y }, p3]
          : [p0, { x: midX, y: p0.y }, { x: midX, y: midY }, { x: p3.x, y: midY }, p3];
    const id = `a${String(a).padStart(4, "0")}`;
    routes.set(id, pts);
    ignore.set(id, new Set([`n${s}`, `n${t}`]));
  }
  return { routes, obstacles, ignore };
};

const run = (sc: Scenario) =>
  normalizeRoutes(sc.routes, {
    obstacles: sc.obstacles,
    ignoreObstacleIdsByArrow: sc.ignore,
    obstaclePadding: 12,
    gridSize: 16,
    snapToGrid: true,
    corridorTolerance: 2,
    minStubLength: 24,
  });

const digest = (routes: Map<string, Point[]>) =>
  createHash("sha1")
    .update(JSON.stringify([...routes.entries()].sort(([a], [b]) => (a < b ? -1 : 1))))
    .digest("hex");

// Captured from the pre-optimization implementation (full-graph crossing recount per arrow).
// A mismatch means the optimization changed normalizer behavior.
const GOLDEN: Record<string, string> = {
  "seed11-cols5-arrows60": "dd48ddc13c9305e7aae28d9d792b9c73c9b3cb26",
  "seed22-cols6-arrows90": "c08f38a1e2a4c1189b3603bb1d209e5b21ff1097",
  "seed33-cols4-arrows40": "ebb5601e9dfacd99d4af3222011c2cab67b260de",
  "seed44-cols8-arrows150": "87648791b8d6eb78ba5dbda7007d6d4fe032d22f",
};

describe("normalizeRoutes – behavior preservation", () => {
  for (const [key] of Object.entries(GOLDEN)) {
    const [, seed, cols, arrows] = /seed(\d+)-cols(\d+)-arrows(\d+)/.exec(key)!;
    it(`produces the recorded output for ${key}`, () => {
      const out = digest(run(buildScenario(Number(seed), Number(cols), Number(arrows))));
      expect(out).toBe(GOLDEN[key]);
    });
  }
});

describe("createCrossingCounter", () => {
  it("per-arrow delta equals the global-total delta for every arrow", () => {
    const sc = buildScenario(7, 5, 60);
    const base = countTotalCrossings(sc.routes);
    const counter = createCrossingCounter(sc.routes);

    // Replace each arrow with a shifted copy and compare both ways of counting.
    for (const [arrowId, points] of sc.routes) {
      const shifted = points.map((p, i) =>
        i === 0 || i === points.length - 1 ? p : { x: p.x + 16, y: p.y },
      );
      const after = new Map(sc.routes);
      after.set(arrowId, shifted);
      const globalDelta = countTotalCrossings(after) - base;
      const localDelta = counter(arrowId, shifted) - counter(arrowId, points);
      expect(localDelta).toBe(globalDelta);
    }
  });
});

describe("normalizeRoutes – invariants", () => {
  it("preserves endpoints and never introduces obstacle clipping", () => {
    const sc = buildScenario(99, 6, 90);
    const out = run(sc);
    let checkedClean = 0;
    for (const [arrowId, original] of sc.routes) {
      const normalized = out.get(arrowId)!;
      const ignore = sc.ignore.get(arrowId)!;
      expect(normalized.length).toBeGreaterThanOrEqual(2);
      expect(normalized[0]).toEqual(original[0]);
      expect(normalized[normalized.length - 1]).toEqual(original[original.length - 1]);
      if (!pathIntersectsObstacles(original, sc.obstacles, ignore, 12)) {
        checkedClean += 1;
        expect(pathIntersectsObstacles(normalized, sc.obstacles, ignore, 12)).toBe(false);
      }
    }
    // the scenario deliberately clips many obstacles; make sure some clean routes exist too
    expect(checkedClean).toBeGreaterThan(2);
  });

  it("is deterministic", () => {
    const sc = buildScenario(5, 5, 60);
    expect(digest(run(sc))).toBe(digest(run(sc)));
  });
});

describe("normalizeRoutes – scaling", () => {
  it("normalizes 1000 routes in well under the old quadratic cost (was ~16s here)", () => {
    const sc = buildScenario(2024, 23, 1000);
    const t0 = performance.now();
    const out = run(sc);
    const elapsed = performance.now() - t0;
    expect(out.size).toBe(1000);
    expect(elapsed).toBeLessThan(PERF_BUDGET_MS);
  }, 60000);
});

// Measured ~85ms after the fix vs ~16.5s before; the budget leaves >20x headroom for slow CI.
const PERF_BUDGET_MS = 2000;

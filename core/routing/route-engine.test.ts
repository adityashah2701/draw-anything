import { describe, expect, it } from "vitest";
import {
  RouteEngineEdge,
  createRouteEngineState,
  markEdgeDirty,
  pruneRouteEngineState,
  routeWithEngine,
} from "@/core/routing/route-engine";
import { routeArrowBatch } from "@/core/routing/orthogonal-router";
import { computeParallelOffsets } from "@/core/routing/parallel-edge-manager";
import type { RoutingObstacle } from "@/core/routing/obstacle-avoidance";

const box = (
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): RoutingObstacle => ({ id, bounds: { minX, minY, maxX, maxY } });

const A = box("A", 0, 0, 100, 60);
const B = box("B", 300, 0, 400, 60);

const edge = (overrides: Partial<RouteEngineEdge> = {}): RouteEngineEdge => ({
  arrowId: "e1",
  sourceId: "A",
  targetId: "B",
  start: { x: 100, y: 30 },
  end: { x: 300, y: 30 },
  startHandle: "right",
  endHandle: "left",
  ...overrides,
});

const last = <T>(items: T[]): T => items[items.length - 1];

describe("routeWithEngine – incremental state", () => {
  it("reuses the cached route when nothing changed", () => {
    const state = createRouteEngineState();
    const config = { obstacles: [A, B] };

    const first = routeWithEngine([edge()], config, state);
    const second = routeWithEngine([edge()], config, state);

    expect(first.routedArrowIds).toEqual(["e1"]);
    expect(second.routedArrowIds).toEqual([]);
    expect(second.routes.get("e1")).toEqual(first.routes.get("e1"));
  });

  it("re-routes when the endpoint moves, without an explicit markEdgeDirty", () => {
    const state = createRouteEngineState();
    const config = { obstacles: [A, B] };
    routeWithEngine([edge()], config, state);

    const moved = edge({ end: { x: 300, y: 50 } });
    const result = routeWithEngine([moved], config, state);

    expect(result.routedArrowIds).toEqual(["e1"]);
    expect(last(result.routes.get("e1")!)).toEqual({ x: 300, y: 50 });
  });

  it("re-routes when routingMode changes, without an explicit markEdgeDirty", () => {
    const state = createRouteEngineState();
    const config = { obstacles: [A, B] };
    routeWithEngine(
      [edge({ end: { x: 300, y: 50 } })],
      config,
      state,
    );

    const result = routeWithEngine(
      [edge({ end: { x: 300, y: 50 }, routingMode: "straight" })],
      config,
      state,
    );

    expect(result.routedArrowIds).toEqual(["e1"]);
    expect(result.routes.get("e1")).toHaveLength(2);
  });

  it("re-routes only the dirty edge when another edge is untouched", () => {
    const state = createRouteEngineState();
    const C = box("C", 0, 200, 100, 260);
    const D = box("D", 300, 200, 400, 260);
    const config = { obstacles: [A, B, C, D] };
    const e1 = edge();
    const e2 = edge({
      arrowId: "e2",
      sourceId: "C",
      targetId: "D",
      start: { x: 100, y: 230 },
      end: { x: 300, y: 230 },
    });
    routeWithEngine([e1, e2], config, state);

    markEdgeDirty(state, "e2");
    const result = routeWithEngine([e1, e2], config, state);

    expect(result.routedArrowIds).toEqual(["e2"]);
  });
});

describe("pruneRouteEngineState", () => {
  it("forgets deleted arrows everywhere, including the congestion map", () => {
    const state = createRouteEngineState();
    const C = box("C", 0, 200, 100, 260);
    const D = box("D", 300, 200, 400, 260);
    const config = { obstacles: [A, B, C, D] };
    const e2 = edge({
      arrowId: "e2",
      sourceId: "C",
      targetId: "D",
      start: { x: 100, y: 230 },
      end: { x: 300, y: 230 },
    });
    routeWithEngine([edge(), e2], config, state);
    expect(state.congestionMap.arrowCells.has("e2")).toBe(true);

    pruneRouteEngineState(state, new Set(["e1"]));

    expect(state.routeCache.has("e2")).toBe(false);
    expect(state.pathHashCache.has("e2")).toBe(false);
    expect(state.dirtyEdges.has("e2")).toBe(false);
    expect(state.congestionMap.arrowCells.has("e2")).toBe(false);
    expect(state.congestionMap.cells.size).toBe(
      // only e1's cells remain
      state.congestionMap.arrowCells.get("e1")!.size,
    );
    // live arrow untouched
    expect(state.routeCache.has("e1")).toBe(true);
    expect(state.congestionMap.arrowCells.has("e1")).toBe(true);
  });

  it("does not evict live arrows when a later call only routes a subset", () => {
    const state = createRouteEngineState();
    const C = box("C", 0, 200, 100, 260);
    const D = box("D", 300, 200, 400, 260);
    const config = { obstacles: [A, B, C, D] };
    const e2 = edge({
      arrowId: "e2",
      sourceId: "C",
      targetId: "D",
      start: { x: 100, y: 230 },
      end: { x: 300, y: 230 },
    });
    routeWithEngine([edge(), e2], config, state);

    // The canvas hook routes one arrow at a time.
    markEdgeDirty(state, "e1");
    routeWithEngine([edge()], config, state);

    expect(state.routeCache.has("e2")).toBe(true);
    expect(state.congestionMap.arrowCells.has("e2")).toBe(true);
  });
});

describe("routeWithEngine – partial / corrupted input", () => {
  it("skips null, undefined-coordinate and unconnected edges without throwing", () => {
    const corrupted = [
      null,
      undefined,
      edge({ arrowId: "no-start", start: undefined as never }),
      edge({ arrowId: "nan-end", end: { x: NaN, y: 0 } }),
      edge({ arrowId: "no-source", sourceId: undefined }),
      edge({ arrowId: "no-target", targetId: undefined }),
      edge({ arrowId: "ok" }),
    ] as unknown as RouteEngineEdge[];

    const run = () =>
      routeWithEngine(corrupted, { obstacles: [A, B] }, createRouteEngineState());

    expect(run).not.toThrow();
    const result = run();
    expect([...result.routes.keys()]).toEqual(["ok"]);
  });

  it("ignores malformed existingRoutes instead of crashing the whole batch", () => {
    const existingRoutes = [
      { arrowId: "x1", points: undefined },
      { arrowId: "x2", points: [{ x: 0, y: 0 }, undefined] },
      { arrowId: "x3", points: [{ x: 0, y: 0 }] },
      { arrowId: "x4", points: [{ x: NaN, y: 0 }, { x: 5, y: 5 }] },
    ] as unknown as Array<{ arrowId: string; points: never[] }>;

    const run = () =>
      routeWithEngine([edge()], { obstacles: [A, B], existingRoutes });

    expect(run).not.toThrow();
    expect(run().routes.get("e1")?.length).toBeGreaterThanOrEqual(2);
  });

  it("drops malformed obstacles instead of crashing", () => {
    const obstacles = [
      A,
      B,
      { id: "bad1", bounds: undefined },
      { id: "bad2", bounds: { minX: NaN, minY: 0, maxX: 1, maxY: 1 } },
      null,
    ] as unknown as RoutingObstacle[];

    expect(() => routeWithEngine([edge()], { obstacles })).not.toThrow();
  });
});

describe("straight routing mode", () => {
  const diagonal = (overrides: Partial<RouteEngineEdge> = {}) =>
    edge({
      arrowId: "s1",
      end: { x: 300, y: 130 },
      routingMode: "straight",
      ...overrides,
    });
  const lower = box("B", 300, 100, 400, 160);

  it("routeWithEngine keeps a straight arrow as a single diagonal segment", () => {
    const result = routeWithEngine([diagonal()], { obstacles: [A, lower] });
    expect(result.routes.get("s1")).toEqual([
      { x: 100, y: 30 },
      { x: 300, y: 130 },
    ]);
  });

  it("stays straight across incremental re-routes and next to orthogonal arrows", () => {
    const state = createRouteEngineState();
    const config = { obstacles: [A, lower] };
    const ortho = edge({ arrowId: "o1", end: { x: 300, y: 130 } });
    for (let i = 0; i < 3; i += 1) {
      markEdgeDirty(state, "s1");
      const result = routeWithEngine([diagonal(), ortho], config, state);
      expect(result.routes.get("s1")).toHaveLength(2);
      expect(result.routes.get("o1")!.length).toBeGreaterThan(2);
    }
  });

  it("routeArrowBatch keeps a straight arrow straight", () => {
    const routes = routeArrowBatch({
      arrows: [diagonal()] as never,
      obstacles: [A, lower],
    });
    expect(routes.get("s1")).toEqual([
      { x: 100, y: 30 },
      { x: 300, y: 130 },
    ]);
  });
});

describe("incremental state – repeat-call stability", () => {
  it("does not drift when a parallel bundle is re-submitted unchanged", () => {
    const state = createRouteEngineState();
    const config = { obstacles: [A, B] };
    const bundle = ["p1", "p2", "p3"].map((arrowId) => edge({ arrowId }));

    const snapshots = Array.from({ length: 5 }, () =>
      JSON.stringify([...routeWithEngine(bundle, config, state).routes.entries()]),
    );

    expect(new Set(snapshots).size).toBe(1);
  });

  it("matches a from-scratch route after an unrelated edge is added", () => {
    const state = createRouteEngineState();
    const C = box("C", 0, 200, 100, 260);
    const D = box("D", 300, 200, 400, 260);
    const config = { obstacles: [A, B, C, D] };
    const first = edge();
    const second = edge({
      arrowId: "e2",
      sourceId: "C",
      targetId: "D",
      start: { x: 100, y: 230 },
      end: { x: 300, y: 230 },
    });
    routeWithEngine([first], config, state);
    const incremental = routeWithEngine([first, second], config, state);

    expect(incremental.routedArrowIds).toEqual(["e2"]);
    expect(incremental.routes.get("e1")).toEqual(
      routeWithEngine([first], config).routes.get("e1"),
    );
  });
});

describe("routeArrowBatch / computeParallelOffsets – drag-state input", () => {
  const dragging = [
    { arrowId: "d1", start: { x: 0, y: 0 }, end: undefined },
    { arrowId: "d2", sourceId: "A", start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
    { arrowId: "d3", sourceId: "A", targetId: "B", start: undefined, end: undefined },
    {
      arrowId: "d4",
      sourceId: "A",
      targetId: "B",
      start: { x: 0, y: 0 },
      end: { x: 9, y: 9 },
      existingPoints: [{ x: 0, y: 0 }],
    },
  ] as never;

  it("routeArrowBatch returns an empty map for partial arrows", () => {
    expect(routeArrowBatch({ arrows: dragging, obstacles: [A, B] }).size).toBe(0);
  });

  it("computeParallelOffsets tolerates missing points and null entries", () => {
    expect(() =>
      computeParallelOffsets([
        null,
        { arrowId: "a", start: undefined, end: { x: 1, y: 1 } },
        { arrowId: "b", start: { x: 1, y: 1 }, end: undefined },
        { arrowId: "c", start: { x: 1, y: 1 }, end: { x: 9, y: 9 } },
      ] as never),
    ).not.toThrow();
  });

  it("routeArrowBatch drops arrows whose existingPoints contain holes", () => {
    const arrows = [
      {
        arrowId: "h1",
        sourceId: "A",
        targetId: "B",
        start: { x: 100, y: 30 },
        end: { x: 300, y: 30 },
        existingPoints: [{ x: 100, y: 30 }, undefined, { x: 300, y: 30 }],
      },
    ] as never;
    expect(() => routeArrowBatch({ arrows, obstacles: [A, B] })).not.toThrow();
  });
});

describe("routeWithEngine – seeded fuzz (no throw, deterministic)", () => {
  // Small deterministic PRNG so failures are reproducible.
  const mulberry32 = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it("never throws across 300 randomly corrupted edge sets and is repeatable", () => {
    const rand = mulberry32(0xc0ffee);
    const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
    const maybePoint = () =>
      pick([
        { x: rand() * 800, y: rand() * 600 },
        { x: rand() * 800, y: rand() * 600 },
        undefined,
        null,
        { x: NaN, y: 1 },
        { x: Infinity, y: 1 },
        { y: 3 },
      ]);
    const obstacles = [A, B, box("C", 150, 150, 250, 250)];

    const build = () => {
      const r = mulberry32(0xbeef);
      const edges: unknown[] = [];
      for (let i = 0; i < 12; i += 1) {
        edges.push(
          r() < 0.1
            ? null
            : {
                arrowId: r() < 0.1 ? "" : `f${i}`,
                sourceId: r() < 0.2 ? undefined : pick(["A", "B", "C"]),
                targetId: r() < 0.2 ? undefined : pick(["A", "B", "C"]),
                start: maybePoint(),
                end: maybePoint(),
                startHandle: pick(["left", "right", "top", "bottom", undefined]),
                endHandle: pick(["left", "right", "top", "bottom", undefined]),
              },
        );
      }
      return edges as RouteEngineEdge[];
    };

    for (let round = 0; round < 300; round += 1) {
      const edges = build();
      expect(() => routeWithEngine(edges, { obstacles })).not.toThrow();
      expect(() => computeParallelOffsets(edges as never)).not.toThrow();
    }

    const snapshot = (edges: RouteEngineEdge[]) =>
      JSON.stringify([...routeWithEngine(edges, { obstacles }).routes.entries()]);
    const edges = [
      edge({ arrowId: "r1" }),
      edge({ arrowId: "r2", end: { x: 300, y: 45 } }),
      edge({ arrowId: "r3", end: { x: 300, y: 15 } }),
    ];
    expect(snapshot(edges)).toBe(snapshot(edges));
  });
});

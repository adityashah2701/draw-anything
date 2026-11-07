import { describe, it, expect } from "vitest";
import {
  computeParallelOffsets,
  type ParallelEdgeDescriptor,
} from "@/core/routing/parallel-edge-manager";
import {
  routeArrowBatch,
  routeArrowPoints,
} from "@/core/routing/orthogonal-router";
import {
  findNearestAnchorSnapPure,
  buildGridIndex,
} from "@/core/snap/magnetic-snap";
import {
  toBounds,
  toBox,
  boundsFromPoints,
  intersectsBox,
  containsBox,
} from "@/core/model";
import { isValidPoint, isValidPointArray } from "@/core/routing/routing-guards";

describe("Routing Regression Tests — Defensive Guarantees (AGENTS.md Fix)", () => {
  describe("computeParallelOffsets", () => {
    it("never crashes on empty or null array input", () => {
      expect(() => computeParallelOffsets([])).not.toThrow();
      expect(computeParallelOffsets([]).size).toBe(0);
      // @ts-expect-error testing defensive runtime guard
      expect(() => computeParallelOffsets(null)).not.toThrow();
      // @ts-expect-error testing defensive runtime guard
      expect(() => computeParallelOffsets(undefined)).not.toThrow();
    });

    it("never crashes on undefined/partial points (TypeError: Cannot read properties of undefined reading 'x')", () => {
      const corruptedDescriptors = [
        // completely empty object
        {} as ParallelEdgeDescriptor,
        // missing start
        { arrowId: "arrow-1", end: { x: 100, y: 100 } } as ParallelEdgeDescriptor,
        // missing end
        { arrowId: "arrow-2", start: { x: 50, y: 50 } } as ParallelEdgeDescriptor,
        // point missing .x
        { arrowId: "arrow-3", start: { y: 50 } as unknown, end: { x: 100, y: 100 } } as ParallelEdgeDescriptor,
        // point missing .y
        { arrowId: "arrow-4", start: { x: 50, y: 50 }, end: { x: 100 } as unknown } as ParallelEdgeDescriptor,
        // null points
        { arrowId: "arrow-5", start: null as unknown, end: null as unknown } as ParallelEdgeDescriptor,
      ];

      expect(() => computeParallelOffsets(corruptedDescriptors)).not.toThrow();
      const offsets = computeParallelOffsets(corruptedDescriptors);
      expect(offsets.size).toBe(0);
    });

    it("computes distinct offsets for valid parallel edges", () => {
      const edges: ParallelEdgeDescriptor[] = [
        {
          arrowId: "edge-1",
          sourceId: "nodeA",
          targetId: "nodeB",
          start: { x: 0, y: 50 },
          end: { x: 200, y: 50 },
        },
        {
          arrowId: "edge-2",
          sourceId: "nodeA",
          targetId: "nodeB",
          start: { x: 0, y: 50 },
          end: { x: 200, y: 50 },
        },
      ];

      const offsets = computeParallelOffsets(edges, 16);
      expect(offsets.size).toBe(2);
      expect(offsets.get("edge-1")).not.toBe(offsets.get("edge-2"));
    });
  });

  describe("routeArrowBatch defensive filtering", () => {
    it("safely skips arrows in drag state without sourceId or targetId", () => {
      const batchInput = {
        arrows: [
          // Drag state: missing targetId & end
          {
            arrowId: "drag-arrow",
            sourceId: "node-1",
            start: { x: 100, y: 100 },
          } as unknown as { arrowId: string; sourceId: string; targetId: string; start: { x: number; y: number }; end: { x: number; y: number } },
          // Corrupted: points.length < 2
          {
            arrowId: "corrupted-arrow",
            sourceId: "node-1",
            targetId: "node-2",
            start: { x: 100, y: 100 },
            end: { x: 200, y: 200 },
            existingPoints: [{ x: 100, y: 100 }],
          },
        ],
      };

      expect(() => routeArrowBatch(batchInput)).not.toThrow();
      const routes = routeArrowBatch(batchInput);
      expect(routes.size).toBe(0);
    });

    it("routes valid arrows cleanly", () => {
      const batchInput = {
        arrows: [
          {
            arrowId: "valid-arrow-1",
            sourceId: "node-1",
            targetId: "node-2",
            start: { x: 100, y: 100 },
            end: { x: 300, y: 100 },
          },
        ],
      };

      expect(() => routeArrowBatch(batchInput)).not.toThrow();
      const routes = routeArrowBatch(batchInput);
      expect(routes.has("valid-arrow-1")).toBe(true);
      const points = routes.get("valid-arrow-1")!;
      expect(points.length).toBeGreaterThanOrEqual(2);
      expect(points[0]).toEqual({ x: 100, y: 100 });
      expect(points[points.length - 1]).toEqual({ x: 300, y: 100 });
    });
  });

  describe("routeArrowPoints fail-safe fallback", () => {
    it("returns safe straight fallback on invalid points instead of crashing", () => {
      // @ts-expect-error testing defensive guard
      const result = routeArrowPoints({ start: undefined, end: undefined });
      expect(result).toEqual([]);

      // @ts-expect-error testing defensive guard
      const onePoint = routeArrowPoints({ start: { x: 50, y: 50 }, end: undefined });
      expect(onePoint).toEqual([{ x: 50, y: 50 }]);
    });
  });

  describe("Pure Magnetic Snap", () => {
    it("returns null safely on invalid point input without crashing", () => {
      const emptyIndex = {
        anchors: [],
        shapes: [],
        anchorsByElementId: new Map(),
        anchorByLookupKey: new Map(),
      };
      const emptyGrid = buildGridIndex([], 40);

      const res = findNearestAnchorSnapPure({
        point: null as unknown as { x: number; y: number },
        radius: 20,
        anchorIndex: emptyIndex,
        gridIndex: emptyGrid,
        typeById: new Map(),
        useSpatialFiltering: false,
      });

      expect(res).toBeNull();
    });

    it("finds closest anchor within radius", () => {
      const anchorRecord = {
        elementId: "shape-1",
        anchor: { id: "shape-1:top", x: 100, y: 100, side: "top" as const },
      };
      const anchorIndex = {
        anchors: [anchorRecord],
        shapes: [],
        anchorsByElementId: new Map([["shape-1", [anchorRecord.anchor]]]),
        anchorByLookupKey: new Map(),
      };
      const gridIndex = buildGridIndex(anchorIndex.anchors, 40);

      const match = findNearestAnchorSnapPure({
        point: { x: 105, y: 102 },
        radius: 20,
        anchorIndex,
        gridIndex,
        typeById: new Map(),
        useSpatialFiltering: false,
      });

      expect(match).not.toBeNull();
      expect(match?.elementId).toBe("shape-1");
      expect(match?.anchor.id).toBe("shape-1:top");
    });
  });

  describe("Canonical Geometry Helpers", () => {
    it("converts Box to Bounds with correct width and height", () => {
      const box = { minX: 10, minY: 20, maxX: 110, maxY: 120 };
      const bounds = toBounds(box);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(100);
      expect(toBox(bounds)).toEqual(box);
    });

    it("computes bounds enclosing an array of points", () => {
      const points = [
        { x: 20, y: 50 },
        { x: -10, y: 80 },
        { x: 100, y: -30 },
      ];
      const bounds = boundsFromPoints(points);
      expect(bounds).not.toBeNull();
      expect(bounds?.minX).toBe(-10);
      expect(bounds?.minY).toBe(-30);
      expect(bounds?.maxX).toBe(100);
      expect(bounds?.maxY).toBe(80);
      expect(bounds?.width).toBe(110);
      expect(bounds?.height).toBe(110);
    });

    it("evaluates intersectsBox and containsBox accurately", () => {
      const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      const inner = { minX: 10, minY: 10, maxX: 90, maxY: 90 };
      const separate = { minX: 200, minY: 200, maxX: 300, maxY: 300 };

      expect(intersectsBox(outer, inner)).toBe(true);
      expect(containsBox(outer, inner)).toBe(true);
      expect(containsBox(inner, outer)).toBe(false);

      expect(intersectsBox(outer, separate)).toBe(false);
      expect(containsBox(outer, separate)).toBe(false);
    });

    it("verifies point validation guards", () => {
      expect(isValidPoint({ x: 0, y: 0 })).toBe(true);
      expect(isValidPoint({ x: Number.NaN, y: 0 })).toBe(false);
      expect(isValidPoint({ x: Number.POSITIVE_INFINITY, y: 0 })).toBe(false);
      expect(isValidPoint(null)).toBe(false);
      expect(isValidPoint({})).toBe(false);

      expect(isValidPointArray([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(true);
      expect(isValidPointArray([{ x: 0, y: 0 }])).toBe(false);
    });
  });
});

import { describe, expect, it } from "vitest";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { snapSelection, type AlignTarget, type SnapInput } from "./alignment";

const b = (x: number, y: number, w: number, h: number): Bounds => ({ minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h });
const target = (box: Bounds, baselines?: number[]): AlignTarget => ({ box, baselines });

const snap = (input: Partial<SnapInput> & Pick<SnapInput, "moving">) =>
  snapSelection({ alignTargets: [], threshold: 6, ...input });

describe("alignment of edges and centres", () => {
  it("does nothing without targets", () => {
    expect(snap({ moving: b(0, 0, 100, 50) })).toEqual({ dx: 0, dy: 0, guides: [], spans: [] });
  });

  it("pulls an edge onto a neighbour's edge within the threshold and reports the guide", () => {
    const r = snap({ moving: b(197, 0, 100, 50), alignTargets: [target(b(300, 200, 80, 40))] });
    expect(r.dx).toBe(3);
    expect(r.guides).toContainEqual({ axis: "x", at: 300, from: 0, to: 240 });
  });

  it("snaps centres, and each axis on its own", () => {
    const r = snap({ moving: b(3, 98, 100, 50), alignTargets: [target(b(0, 100, 100, 50))] });
    expect([r.dx, r.dy]).toEqual([-3, 2]);
    expect(r.guides.some((g) => g.axis === "x")).toBe(true);
    expect(r.guides.some((g) => g.axis === "y")).toBe(true);
  });

  it("takes the smallest shift among many lines", () => {
    const r = snap({ moving: b(0, 0, 100, 50), alignTargets: [target(b(104, 300, 10, 10)), target(b(102, 400, 10, 10))] });
    expect(r.dx).toBe(2);
  });

  it("does not snap beyond the threshold, and the threshold is what makes it zoom independent", () => {
    const input = { moving: b(190, 0, 100, 50), alignTargets: [target(b(300, 200, 80, 40))] };
    expect(snap({ ...input, threshold: 6 }).dx).toBe(0);
    expect(snap({ ...input, threshold: 12 }).dx).toBe(10);
    // 6 screen pixels at 0.5x zoom reach 12 world units; at 4x they reach only 1.5
    expect(snap({ ...input, threshold: 6 / 0.5 }).dx).toBe(10);
    expect(snap({ ...input, threshold: 6 / 4 }).dx).toBe(0);
  });

  it("gives the same answer for the same input however many times it is asked", () => {
    const input = { moving: b(203, 2, 100, 50), alignTargets: [target(b(300, 0, 100, 50))] };
    const first = snap(input);
    snap({ ...input, moving: b(900, 900, 100, 50) });
    expect(snap(input)).toEqual(first);
  });

  it("an unmatched axis stays where the pointer put it", () => {
    const r = snap({ moving: b(197, 33, 100, 50), alignTargets: [target(b(300, 200, 80, 40))] });
    expect(r.dy).toBe(0);
  });
});

describe("text baselines", () => {
  const text = (x: number, y: number) => target(b(x, y, 80, 20), [y + 16]);

  it("aligns a moving text's baseline with another text's baseline", () => {
    // moving baseline at 118; the other text's baseline is at 116 -> shift -2
    const r = snap({ moving: b(0, 102, 60, 20), movingBaselines: [118], alignTargets: [text(300, 100)] });
    expect(r.dy).toBe(-2);
    expect(r.guides).toContainEqual({ axis: "y", at: 116, from: 0, to: 380, kind: "baseline" });
  });

  it("prefers whichever of baseline and edge is nearer", () => {
    const edgeCloser = snap({ moving: b(0, 99, 60, 20), movingBaselines: [113], alignTargets: [target(b(300, 100, 80, 40), [116])] });
    expect(edgeCloser.dy).toBe(1); // top edges: 100 - 99
    const baselineCloser = snap({ moving: b(0, 97, 60, 20), movingBaselines: [115.5], alignTargets: [target(b(300, 100, 80, 40), [116])] });
    expect(baselineCloser.dy).toBe(0.5);
  });

  it("only text takes part: a shape with no baselines is never matched by a baseline", () => {
    const r = snap({ moving: b(0, 102, 60, 20), movingBaselines: [118], alignTargets: [target(b(300, 400, 80, 20))] });
    expect(r.dy).toBe(0);
  });

  it("is ignored when nothing moving has a baseline", () => {
    const r = snap({ moving: b(0, 102, 60, 20), alignTargets: [text(300, 100)] });
    expect(r.guides.some((g) => g.kind === "baseline")).toBe(false);
  });
});

describe("equal spacing", () => {
  const spacing = { options: { spacing: true } };

  it("centres the box between two neighbours so both gaps are equal", () => {
    // L [0,100], R [400,500]; a 100 wide box fits with 100 either side: minX 200
    const r = snap({ ...spacing, moving: b(195, 0, 100, 50), spaceTargets: [b(0, 0, 100, 50), b(400, 0, 100, 50)] });
    expect(r.dx).toBe(5);
    const gaps = r.spans.filter((s) => s.kind === "gap");
    expect(gaps).toHaveLength(2);
    expect(gaps.map((s) => [s.axis, s.from, s.to])).toEqual([["x", 100, 200], ["x", 300, 400]]);
  });

  it("matches the gap between two other shapes when placed after its neighbour", () => {
    // A [0,100], B [150,250] -> gap 50. The box goes after B at the same gap: starts at 300.
    const r = snap({ ...spacing, moving: b(303, 0, 80, 50), spaceTargets: [b(0, 0, 100, 50), b(150, 0, 100, 50)] });
    expect(r.dx).toBe(-3);
    expect(r.spans.filter((s) => s.kind === "gap").map((s) => [s.from, s.to])).toEqual([[100, 150], [250, 300]]);
  });

  it("matches an existing gap placed before its right-hand neighbour", () => {
    // B [300,400], C [450,550] -> gap 50; the box goes before B ending at 250: starts at 170
    const r = snap({ ...spacing, moving: b(167, 0, 80, 50), spaceTargets: [b(300, 0, 100, 50), b(450, 0, 100, 50)] });
    expect(r.dx).toBe(3);
    expect(r.spans.filter((s) => s.kind === "gap").map((s) => [s.from, s.to])).toEqual([[400, 450], [250, 300]]);
  });

  it("works vertically", () => {
    const r = snap({ ...spacing, moving: b(0, 195, 50, 100), spaceTargets: [b(0, 0, 50, 100), b(0, 400, 50, 100)] });
    expect(r.dy).toBe(5);
    expect(r.spans.filter((s) => s.kind === "gap").every((s) => s.axis === "y")).toBe(true);
  });

  it("only considers shapes in the same row or column", () => {
    const r = snap({ ...spacing, moving: b(195, 0, 100, 50), spaceTargets: [b(0, 500, 100, 50), b(400, 500, 100, 50)] });
    expect(r.dx).toBe(0);
    expect(r.spans.filter((s) => s.kind === "gap")).toEqual([]);
  });

  it("does not snap to spacing out of reach, or when switched off", () => {
    const targets = [b(0, 0, 100, 50), b(400, 0, 100, 50)];
    expect(snap({ ...spacing, moving: b(180, 0, 100, 50), spaceTargets: targets }).dx).toBe(0); // 20 away
    expect(snap({ moving: b(195, 0, 100, 50), spaceTargets: targets }).dx).toBe(0); // spacing off
  });

  it("needs room: a box too big for the gap is not centred in it", () => {
    const r = snap({ ...spacing, moving: b(60, 0, 300, 50), spaceTargets: [b(0, 0, 100, 50), b(400, 0, 100, 50)] });
    expect(r.spans.filter((s) => s.kind === "gap")).toEqual([]);
  });

  it("ignores touching shapes as gaps", () => {
    const r = snap({ ...spacing, moving: b(303, 0, 80, 50), spaceTargets: [b(0, 0, 100, 50), b(100, 0, 100, 50)] });
    expect(r.spans.filter((s) => s.kind === "gap")).toEqual([]);
  });

  it("alignment wins when it is nearer than a spacing snap", () => {
    const r = snap({
      ...spacing,
      moving: b(201, 0, 100, 50),
      alignTargets: [target(b(300, 200, 100, 50))], // its left edge 300 aligns with the box's right edge 301
      spaceTargets: [b(0, 0, 100, 50), b(400, 0, 100, 50)], // spacing wants minX 200 (1 away) as well
    });
    expect(Math.abs(r.dx)).toBeLessThanOrEqual(1);
  });

  it("is the same call whatever order the targets come in", () => {
    const a = snap({ ...spacing, moving: b(195, 0, 100, 50), spaceTargets: [b(0, 0, 100, 50), b(400, 0, 100, 50)] });
    const c = snap({ ...spacing, moving: b(195, 0, 100, 50), spaceTargets: [b(400, 0, 100, 50), b(0, 0, 100, 50)] });
    expect(c).toEqual(a);
  });
});

describe("live distances", () => {
  const measures = { options: { measures: true } };

  it("reports the gap to the nearest neighbour on each side that it overlaps", () => {
    const r = snap({
      ...measures,
      moving: b(200, 100, 100, 50),
      spaceTargets: [b(0, 100, 100, 50), b(400, 90, 100, 70), b(150, 0, 100, 50), b(150, 300, 100, 50), b(0, 600, 10, 10)],
    });
    const d = r.spans.filter((s) => s.kind === "distance");
    expect(d.map((s) => [s.axis, s.from, s.to]).sort()).toEqual([
      ["x", 100, 200],
      ["x", 300, 400],
      ["y", 150, 300],
      ["y", 50, 100],
    ].sort());
  });

  it("picks the nearest of several neighbours", () => {
    const r = snap({ ...measures, moving: b(300, 0, 50, 50), spaceTargets: [b(0, 0, 50, 50), b(200, 0, 50, 50)] });
    expect(r.spans.filter((s) => s.axis === "x").map((s) => [s.from, s.to])).toEqual([[250, 300]]);
  });

  it("measures from the snapped position, not the raw one", () => {
    const r = snap({ ...measures, moving: b(197, 0, 100, 50), alignTargets: [target(b(300, 200, 80, 40))], spaceTargets: [b(0, 0, 100, 50)] });
    expect(r.dx).toBe(3);
    expect(r.spans.find((s) => s.axis === "x")).toMatchObject({ from: 100, to: 200 });
  });

  it("skips shapes it overlaps, and shapes beside it but not across from it", () => {
    const r = snap({ ...measures, moving: b(100, 100, 100, 50), spaceTargets: [b(150, 100, 100, 50), b(300, 500, 50, 50)] });
    expect(r.spans).toEqual([]);
  });

  it("does not repeat a gap that is already shown as an equal spacing", () => {
    const r = snap({
      options: { spacing: true, measures: true },
      moving: b(195, 0, 100, 50),
      spaceTargets: [b(0, 0, 100, 50), b(400, 0, 100, 50)],
    });
    expect(r.spans.filter((s) => s.axis === "x")).toHaveLength(2);
    expect(r.spans.every((s) => s.kind === "gap")).toBe(true);
  });

  it("draws the span across the middle of what the two boxes share", () => {
    const r = snap({ ...measures, moving: b(200, 100, 100, 100), spaceTargets: [b(0, 150, 100, 100)] });
    expect(r.spans[0].at).toBe(175); // shared rows 150..200
  });

  it("is quiet when switched off", () => {
    expect(snap({ moving: b(200, 100, 100, 50), spaceTargets: [b(0, 100, 100, 50)] }).spans).toEqual([]);
  });
});

describe("many targets", () => {
  it("handles two thousand shapes within a frame", () => {
    const targets = Array.from({ length: 2000 }, (_, i) => b((i % 50) * 130, Math.floor(i / 50) * 90, 100, 50));
    const input = { alignTargets: targets.map((box) => target(box)), spaceTargets: targets, options: { spacing: true, measures: true }, threshold: 6 };
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) snapSelection({ ...input, moving: b(413 + i, 207, 100, 50) });
    expect((performance.now() - t0) / 100).toBeLessThan(8);
  });
});

import { describe, expect, it } from "vitest";
import { parseAnchorSide } from "@/core/anchors/anchor-geometry";
import { parsePortAnchorId, portAnchorId, portPoint, spreadFractions } from "@/core/anchors/ports";

const box = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

describe("port anchor ids", () => {
  it("extend the plain id so the old parser still reads the side", () => {
    const id = portAnchorId("n1", "right", 0.25);
    expect(id).toBe("n1-anchor-p25-right");
    expect(parseAnchorSide(id)).toBe("right");
    expect(parsePortAnchorId(id)).toEqual({ side: "right", fraction: 0.25 });
  });

  it("rounds to a whole percent and rejects plain, malformed and out-of-range ids", () => {
    expect(parsePortAnchorId(portAnchorId("n", "top", 0.333))).toEqual({ side: "top", fraction: 0.33 });
    expect(parsePortAnchorId("n1-anchor-right")).toBeNull();
    expect(parsePortAnchorId("n1-anchor-pxx-right")).toBeNull();
    expect(parsePortAnchorId("n1-anchor-p150-right")).toBeNull();
    expect(parsePortAnchorId("n-anchor-p-10-top")).toBeNull();
  });

  it("works for element ids that themselves contain dashes", () => {
    expect(parsePortAnchorId(portAnchorId("ai-gen-7-node-x", "bottom", 0.4))).toEqual({ side: "bottom", fraction: 0.4 });
  });
});

describe("portPoint", () => {
  it("places a point along each side at the given fraction, left to right and top to bottom", () => {
    expect(portPoint(box, "top", 0.25)).toEqual({ x: 50, y: 0 });
    expect(portPoint(box, "bottom", 0.75)).toEqual({ x: 150, y: 100 });
    expect(portPoint(box, "right", 0.25)).toEqual({ x: 200, y: 25 });
    expect(portPoint(box, "left", 0.5)).toEqual({ x: 0, y: 50 });
  });
});

describe("spreadFractions", () => {
  it("keeps a lone port on the middle", () => {
    expect(spreadFractions(1, 168)).toEqual([0.5]);
  });

  it("spreads several ports evenly about the middle, at least 14 units apart on a 168 side", () => {
    const f = spreadFractions(4, 168);
    expect(f).toHaveLength(4);
    for (let i = 1; i < f.length; i += 1) expect((f[i] - f[i - 1]) * 168).toBeGreaterThanOrEqual(14);
    expect(f[0] + f[3]).toBeCloseTo(1, 5);
    expect(f.every((x) => x >= 0.1 && x <= 0.9)).toBe(true);
  });

  it("stays sorted and inside the side when the side is too short for the ideal spacing", () => {
    const f = spreadFractions(5, 40);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(f.every((x) => x >= 0.1 && x <= 0.9)).toBe(true);
  });
});

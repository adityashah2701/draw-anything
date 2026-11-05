import { describe, expect, it } from "vitest";
import { CHANNEL_EXTRA_CEILING, channelGap, verticalGapsByDepth } from "./channels";

describe("channelGap", () => {
  it("leaves the base gap for one plain connector", () => {
    expect(channelGap(60, { crossings: 0, labelled: false })).toBe(60);
    expect(channelGap(60, { crossings: 1, labelled: false })).toBe(60);
  });

  it("is wider for six labelled connectors than for one plain one, and never beyond the ceiling", () => {
    const busy = channelGap(60, { crossings: 6, labelled: true });
    expect(busy).toBeGreaterThan(channelGap(60, { crossings: 1, labelled: false }));
    expect(busy).toBeLessThanOrEqual(60 + CHANNEL_EXTRA_CEILING);
    expect(channelGap(60, { crossings: 200, labelled: true })).toBe(60 + CHANNEL_EXTRA_CEILING);
  });

  it("never shrinks as connectors are added", () => {
    for (const labelled of [false, true]) {
      let last = 0;
      for (let n = 0; n < 12; n += 1) {
        const gap = channelGap(60, { crossings: n, labelled });
        expect(gap).toBeGreaterThanOrEqual(last);
        last = gap;
      }
    }
  });
});

describe("verticalGapsByDepth", () => {
  const depth = new Map([["a", 0], ["b", 0], ["c", 1], ["d", 2]]);

  it("counts a connector on every layer boundary it crosses, and notes labels", () => {
    const gaps = verticalGapsByDepth(
      [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
        { from: "a", to: "d", labelWidth: 40 }, // crosses boundary 0 and boundary 1
      ],
      depth,
      60,
    );
    expect(gaps.get(0)).toBeGreaterThan(60); // three connectors, one labelled
    expect(gaps.get(1)).toBeGreaterThanOrEqual(60); // one connector
    expect(gaps.get(0)!).toBeGreaterThan(gaps.get(1)!);
  });

  it("gives nothing for edges inside one layer or between unknown nodes", () => {
    expect(verticalGapsByDepth([{ from: "a", to: "b" }, { from: "x", to: "y" }], depth, 60).size).toBe(0);
  });
});

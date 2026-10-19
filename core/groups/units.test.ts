import { describe, expect, it } from "vitest";
import { alignOffsets, distributeOffsets } from "@/features/whiteboard/utils/arrange";
import { buildGroupIndex } from "./group-index";
import { boundsOf, group, rect } from "./test-helpers";
import { expandOffsets, unitBoxes } from "./units";

const stored = () => [
  rect("a", 0, 0, 100, 100, { groupId: "G" }),
  rect("b", 120, 40, 60, 60, { groupId: "G" }),
  rect("c", 400, 50, 80, 40),
  rect("d", 800, 200, 50, 50),
  group("G"),
];

const boxes = (selected: string[], list = stored()) => {
  const index = buildGroupIndex(list);
  return unitBoxes(index, selected, (id) => boundsOf(index.shapes.get(id)));
};

describe("unitBoxes", () => {
  it("measures a group as the union of its shapes and a loose shape as itself", () => {
    const units = boxes(["a", "b", "c"]);
    expect(units.map((u) => u.id)).toEqual(["G", "c"]);
    expect(units[0].bounds).toMatchObject({ minX: 0, minY: 0, maxX: 180, maxY: 100, width: 180, height: 100 });
    expect(units[0].leaves).toEqual(["a", "b"]);
    expect(units[1].bounds.minX).toBe(400);
  });

  it("splits a partly selected group into its selected shapes", () => {
    expect(boxes(["a", "c"]).map((u) => u.id)).toEqual(["a", "c"]);
  });

  it("flags units that are locked, including through their group", () => {
    const list = stored().map((s) => (s.id === "G" ? { ...s, locked: true } : s)) as ReturnType<typeof stored>;
    const units = boxes(["a", "b", "c"], list);
    expect(units.find((u) => u.id === "G")!.locked).toBe(true);
    expect(units.find((u) => u.id === "c")!.locked).toBe(false);
  });

  it("leaves out units that cannot be measured", () => {
    const index = buildGroupIndex(stored());
    expect(unitBoxes(index, ["c"], () => null)).toEqual([]);
  });
});

describe("aligning groups as units", () => {
  it("moves the whole group, not its shapes one by one", () => {
    const units = boxes(["a", "b", "c"]);
    const offsets = expandOffsets(units, alignOffsets(units, "right"));
    // right edges: G ends at 180, c at 480 -> G moves +300, c stays
    expect(offsets.get("a")).toEqual({ dx: 300, dy: 0 });
    expect(offsets.get("b")).toEqual({ dx: 300, dy: 0 });
    expect(offsets.has("c")).toBe(false);
  });

  it("keeps relative positions inside the group intact", () => {
    const units = boxes(["a", "b", "c"]);
    const offsets = expandOffsets(units, alignOffsets(units, "middle"));
    expect(offsets.get("a")).toEqual(offsets.get("b"));
  });

  it("never moves a locked unit but still aligns to it", () => {
    const list = stored().map((s) => (s.id === "c" ? { ...s, locked: true } : s)) as ReturnType<typeof stored>;
    const units = boxes(["a", "b", "c"], list);
    const offsets = expandOffsets(units, alignOffsets(units, "right"));
    expect(offsets.has("c")).toBe(false);
    expect(offsets.get("a")).toEqual({ dx: 300, dy: 0 });
  });

  it("distributes groups as units", () => {
    const units = boxes(["a", "b", "c", "d"]);
    const offsets = expandOffsets(units, distributeOffsets(units, "horizontal"));
    // units: G [0,180], c [400,480], d [800,850]; gap = (850 - (180+80+50)) / 2 = 270, so c belongs at 450
    expect(offsets.has("a")).toBe(false); // first stays
    expect(offsets.get("c")).toEqual({ dx: 50, dy: 0 });
    expect(offsets.has("d")).toBe(false); // last stays
  });

  it("skips zero offsets", () => {
    const units = boxes(["a", "b", "c"]);
    expect(expandOffsets(units, new Map([["G", { dx: 0, dy: 0 }]])).size).toBe(0);
  });
});

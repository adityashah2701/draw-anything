import { describe, expect, it } from "vitest";
import { buildGroupIndex } from "@/core/groups/group-index";
import { boundsOf, group, rect } from "@/core/groups/test-helpers";
import { buildSelectionOverlay, frameHandleAt, frameHandlePoints, FRAME_PAD_PX } from "./selection-overlay";

const index = buildGroupIndex([
  rect("a", 0, 0, 100, 100, { groupId: "G", locked: false }),
  rect("b", 200, 0, 100, 100, { groupId: "G" }),
  rect("c", 500, 0, 100, 100),
  rect("d", 800, 0, 100, 100, { locked: true }),
  group("G", { name: "Pair" }),
]);
const bounds = (id: string) => boundsOf(index.shapes.get(id));
const overlay = (selected: string[], entered: string | null = null) => buildSelectionOverlay(index, selected, entered, bounds);

describe("buildSelectionOverlay", () => {
  it("is null with no selection and nothing entered", () => {
    expect(overlay([])).toBeNull();
  });

  it("leaves a lone plain shape to its own chrome", () => {
    const o = overlay(["c"])!;
    expect(o.replacesShapeChrome).toBe(false);
    expect(o.frame).toBeNull();
    expect(o.units).toEqual([]);
  });

  it("frames a group as one unit with its name", () => {
    const o = overlay(["a", "b"])!;
    expect(o.replacesShapeChrome).toBe(true);
    expect(o.frame).toMatchObject({ locked: false, unitIds: ["G"], bounds: { minX: 0, minY: 0, maxX: 300, maxY: 100 } });
    expect(o.units).toEqual([expect.objectContaining({ id: "G", isGroup: true, label: "Pair" })]);
  });

  it("frames several units together, and shows one box for each", () => {
    const o = overlay(["a", "b", "c"])!;
    expect(o.units.map((u) => u.id)).toEqual(["G", "c"]);
    expect(o.frame!.bounds).toMatchObject({ minX: 0, maxX: 600 });
  });

  it("a partly selected group is just its shapes", () => {
    const o = overlay(["a", "c"])!;
    expect(o.units.map((u) => u.id)).toEqual(["a", "c"]);
  });

  it("leaves locked units out of the frame that carries the handles", () => {
    const o = overlay(["c", "d"])!;
    expect(o.units.map((u) => [u.id, u.locked])).toEqual([["c", false], ["d", true]]);
    expect(o.frame).toMatchObject({ locked: false, unitIds: ["c"], bounds: { minX: 500, maxX: 600 } });
  });

  it("shows an all-locked selection without handles", () => {
    const o = overlay(["d", "c"].filter((id) => id === "d"))!;
    expect(o.replacesShapeChrome).toBe(false); // a single plain shape: its own chrome
    const both = buildSelectionOverlay(buildGroupIndex([rect("x", 0, 0, 10, 10, { locked: true }), rect("y", 50, 0, 10, 10, { locked: true })]), ["x", "y"], null, (id) => (id === "x" ? boundsOf(rect("x", 0, 0, 10, 10)) : boundsOf(rect("y", 50, 0, 10, 10))))!;
    expect(both.frame).toMatchObject({ locked: true, unitIds: ["x", "y"] });
  });

  it("outlines the entered group even with nothing selected, and ignores one that is gone", () => {
    expect(overlay([], "G")!.entered).toMatchObject({ id: "G", label: "Pair", bounds: { minX: 0, maxX: 300 } });
    expect(overlay([], "gone")).toBeNull();
  });
});

describe("frame handles", () => {
  const content = { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 };

  it("sit outside the content by a fixed number of screen pixels at any zoom", () => {
    for (const zoom of [0.5, 1, 3]) {
      const nw = frameHandlePoints(content, zoom).find((h) => h.name === "nw")!;
      expect(nw.x).toBeCloseTo(-FRAME_PAD_PX / zoom, 9);
      expect(nw.y).toBeCloseTo(-FRAME_PAD_PX / zoom, 9);
    }
  });

  it("are found by pointer within a fixed screen distance", () => {
    const se = frameHandlePoints(content, 2).find((h) => h.name === "se")!;
    expect(frameHandleAt(content, { x: se.x + 4 / 2, y: se.y }, 2)?.name).toBe("se");
    expect(frameHandleAt(content, { x: se.x + 30 / 2, y: se.y }, 2)).toBeNull();
    expect(frameHandleAt(content, { x: 100, y: 50 }, 1)).toBeNull(); // inside the frame is not a handle
  });

  it("prefers a corner over an edge handle when a small frame makes them overlap", () => {
    const tiny = { minX: 0, minY: 0, maxX: 6, maxY: 6, width: 6, height: 6 };
    const corner = frameHandlePoints(tiny, 1).find((h) => h.name === "ne")!;
    expect(frameHandleAt(tiny, { x: corner.x, y: corner.y }, 1)?.name).toBe("ne");
  });
});

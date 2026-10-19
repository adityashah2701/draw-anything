import { describe, expect, it } from "vitest";
import { buildGroupIndex } from "@/core/groups/group-index";
import { group, rect } from "@/core/groups/test-helpers";
import { effectiveContext, enterableGroup, exitGroup, resolveDoubleClick, resolveGroupClick, resolveHit, resolveMarquee } from "./group-selection";

//  outer { inner { a, b }, c }   d (loose)   other { e, f }
const index = buildGroupIndex([
  rect("a", 0, 0, 10, 10, { groupId: "inner" }),
  rect("b", 20, 0, 10, 10, { groupId: "inner" }),
  rect("c", 40, 0, 10, 10, { groupId: "outer" }),
  rect("d", 60, 0, 10, 10),
  rect("e", 80, 0, 10, 10, { groupId: "other" }),
  rect("f", 100, 0, 10, 10, { groupId: "other" }),
  group("inner", { groupId: "outer" }),
  group("outer"),
  group("other"),
]);

describe("resolveHit", () => {
  it("selects the top-level group, or the shape itself, when nothing is entered", () => {
    expect(resolveHit(index, "a", null)).toEqual({ unitId: "outer", context: null });
    expect(resolveHit(index, "d", null)).toEqual({ unitId: "d", context: null });
  });

  it("selects direct children of the entered group", () => {
    expect(resolveHit(index, "a", "outer")).toEqual({ unitId: "inner", context: "outer" });
    expect(resolveHit(index, "c", "outer")).toEqual({ unitId: "c", context: "outer" });
    expect(resolveHit(index, "a", "inner")).toEqual({ unitId: "a", context: "inner" });
  });

  it("steps out to the nearest group that holds the hit, then to the top level", () => {
    expect(resolveHit(index, "c", "inner")).toEqual({ unitId: "c", context: "outer" });
    expect(resolveHit(index, "d", "inner")).toEqual({ unitId: "d", context: null });
    expect(resolveHit(index, "e", "outer")).toEqual({ unitId: "other", context: null });
  });

  it("ignores an entered group that no longer exists", () => {
    expect(effectiveContext(index, "gone")).toBeNull();
    expect(resolveHit(index, "a", "gone")).toEqual({ unitId: "outer", context: null });
  });
});

describe("resolveGroupClick", () => {
  const click = (hitId: string | null, over: Partial<Parameters<typeof resolveGroupClick>[1]> = {}) =>
    resolveGroupClick(index, { selected: [], hitId, additive: false, entered: null, ...over });

  it("a click on a grouped shape selects the whole group and may start a drag", () => {
    const r = click("a");
    expect(r.selected).toEqual(["a", "b", "c"]);
    expect(r.startDrag).toBe(true);
    expect(r.collapseOnRelease).toBeNull();
  });

  it("a click on a loose shape selects just it", () => {
    expect(click("d").selected).toEqual(["d"]);
  });

  it("a click on empty canvas clears the selection and leaves any entered group", () => {
    const r = click(null, { selected: ["a", "b", "c"], entered: "outer" });
    expect(r.selected).toEqual([]);
    expect(r.context).toBeNull();
    expect(r.startDrag).toBe(false);
  });

  it("shift-click toggles a whole group in and out", () => {
    const added = click("e", { selected: ["d"], additive: true });
    expect(added.selected).toEqual(["d", "e", "f"]);
    const removed = click("e", { selected: ["d", "e", "f"], additive: true });
    expect(removed.selected).toEqual(["d"]);
  });

  it("a plain click on one member of a multi-selection keeps the selection for dragging, collapsing on release", () => {
    const r = click("e", { selected: ["d", "e", "f"] });
    expect(r.selected).toEqual(["d", "e", "f"]);
    expect(r.startDrag).toBe(true);
    expect(r.collapseOnRelease).toEqual(["e", "f"]);
  });

  it("inside an entered group a click picks a child, and shift adds a sibling", () => {
    const one = click("a", { entered: "outer" });
    expect(one.selected).toEqual(["a", "b"]);
    expect(one.context).toBe("outer");
    const two = click("c", { entered: "outer", selected: ["a", "b"], additive: true });
    expect(two.selected).toEqual(["a", "b", "c"]);
  });

  it("selecting all the shapes of a group one by one is the same as selecting the group", () => {
    const r = click("d", { selected: ["e", "f"], additive: true });
    expect(r.selected).toEqual(["d", "e", "f"]);
  });
});

describe("resolveMarquee", () => {
  it("takes groups whole when the box touches any of their shapes", () => {
    const r = resolveMarquee(index, ["b", "d"], null);
    expect(r.selected).toEqual(["a", "b", "c", "d"]);
    expect(r.context).toBeNull();
  });

  it("inside an entered group, picks the touched children and stays inside", () => {
    const r = resolveMarquee(index, ["a", "c"], "outer");
    expect(r.selected).toEqual(["a", "b", "c"]);
    expect(r.context).toBe("outer");
    expect(resolveMarquee(index, ["c"], "outer").selected).toEqual(["c"]);
  });

  it("leaves the entered group when the box also touches something outside it", () => {
    const r = resolveMarquee(index, ["c", "d"], "outer");
    expect(r.selected).toEqual(["c", "d"]);
    expect(r.context).toBeNull();
  });

  it("ignores unknown ids and an empty hit list", () => {
    expect(resolveMarquee(index, ["ghost"], null)).toEqual({ selected: [], context: null });
    expect(resolveMarquee(index, [], null)).toEqual({ selected: [], context: null });
  });
});

describe("double-click, enter and exit", () => {
  it("double-clicking a grouped shape enters its group and selects the child under the pointer", () => {
    expect(resolveDoubleClick(index, "c", null)).toEqual({ kind: "enter", group: "outer", select: ["c"] });
    expect(resolveDoubleClick(index, "a", null)).toEqual({ kind: "enter", group: "outer", select: ["a", "b"] });
  });

  it("double-clicking inside the entered group goes one level deeper, then edits the shape", () => {
    expect(resolveDoubleClick(index, "a", "outer")).toEqual({ kind: "enter", group: "inner", select: ["a"] });
    expect(resolveDoubleClick(index, "a", "inner")).toEqual({ kind: "edit" });
    expect(resolveDoubleClick(index, "c", "outer")).toEqual({ kind: "edit" });
  });

  it("double-clicking a loose shape edits it", () => {
    expect(resolveDoubleClick(index, "d", null)).toEqual({ kind: "edit" });
  });

  it("Enter steps into a selected group but not into a shape or a mixed selection", () => {
    expect(enterableGroup(index, ["e", "f"])).toBe("other");
    expect(enterableGroup(index, ["d"])).toBeNull();
    expect(enterableGroup(index, ["d", "e", "f"])).toBeNull();
    expect(enterableGroup(index, [])).toBeNull();
  });

  it("leaving a group selects it and returns to its parent", () => {
    expect(exitGroup(index, "inner")).toEqual({ context: "outer", select: ["a", "b"] });
    expect(exitGroup(index, "outer")).toEqual({ context: null, select: ["a", "b", "c"] });
    expect(exitGroup(index, null)).toBeNull();
    expect(exitGroup(index, "gone")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildGroupIndex,
  commonParent,
  expandUnits,
  groupLabel,
  isEffectivelyLocked,
  leavesOfUnit,
  rootOf,
  selectedShapeIds,
  selectionUnits,
  splitStored,
  unitUnder,
} from "./group-index";
import { group, rect } from "./test-helpers";

const nested = () => [
  rect("a", 0, 0),
  rect("b", 200, 0, 100, 60, { groupId: "inner" }),
  rect("c", 400, 0, 100, 60, { groupId: "inner" }),
  rect("d", 600, 0, 100, 60, { groupId: "outer" }),
  rect("free", 0, 300),
  group("inner", { groupId: "outer" }),
  group("outer"),
];

describe("splitStored", () => {
  it("separates drawable shapes from group records and keeps order", () => {
    const { shapes, records } = splitStored(nested());
    expect(shapes.map((s) => s.id)).toEqual(["a", "b", "c", "d", "free"]);
    expect(records.map((r) => r.id)).toEqual(["inner", "outer"]);
  });

  it("skips null and malformed entries", () => {
    const { shapes, records } = splitStored([null, undefined, 5, rect("a", 0, 0), { type: "group" }] as never);
    expect(shapes.map((s) => s.id)).toEqual(["a", undefined]);
    expect(records).toEqual([]);
  });
});

describe("buildGroupIndex", () => {
  it("is empty for a board without groups (old boards are untouched)", () => {
    const index = buildGroupIndex([rect("a", 0, 0), rect("b", 10, 10)]);
    expect(index.groups.size).toBe(0);
    expect(index.parentOf.size).toBe(0);
    expect(index.shapes.size).toBe(2);
  });

  it("describes nesting, children in stacking order, and all leaves of each group", () => {
    const index = buildGroupIndex(nested());
    expect([...index.groups.keys()].sort()).toEqual(["inner", "outer"]);
    expect(index.parentOf.get("b")).toBe("inner");
    expect(index.parentOf.get("inner")).toBe("outer");
    expect(index.parentOf.has("a")).toBe(false);
    expect(index.childrenOf.get("outer")).toEqual(["inner", "d"]);
    expect(index.leavesOf.get("outer")).toEqual(["b", "c", "d"]);
    expect(index.leavesOf.get("inner")).toEqual(["b", "c"]);
  });

  it("orders a group's children by their first shape, not by record position", () => {
    const stored = [rect("x", 0, 0, 10, 10, { groupId: "g" }), rect("y", 0, 0, 10, 10, { groupId: "sub" }), rect("z", 0, 0, 10, 10, { groupId: "sub" }), group("sub", { groupId: "g" }), group("g")];
    expect(buildGroupIndex(stored).childrenOf.get("g")).toEqual(["x", "sub"]);
    const reversed = [rect("y", 0, 0, 10, 10, { groupId: "sub" }), rect("z", 0, 0, 10, 10, { groupId: "sub" }), rect("x", 0, 0, 10, 10, { groupId: "g" }), group("g"), group("sub", { groupId: "g" })];
    expect(buildGroupIndex(reversed).childrenOf.get("g")).toEqual(["sub", "x"]);
  });

  it("treats a groupId that points nowhere as ungrouped", () => {
    const index = buildGroupIndex([rect("a", 0, 0, 10, 10, { groupId: "ghost" })]);
    expect(index.parentOf.has("a")).toBe(false);
    expect(index.groups.size).toBe(0);
  });

  it("drops groups that hold no shape, including a chain of them", () => {
    const index = buildGroupIndex([rect("a", 0, 0), group("empty", { groupId: "emptier" }), group("emptier")]);
    expect(index.groups.size).toBe(0);
    expect(index.parentOf.size).toBe(0);
  });

  it("ignores a group record that points at itself", () => {
    const index = buildGroupIndex([rect("a", 0, 0, 10, 10, { groupId: "g" }), group("g", { groupId: "g" })]);
    expect(index.groups.has("g")).toBe(true);
    expect(index.parentOf.has("g")).toBe(false);
    expect(index.leavesOf.get("g")).toEqual(["a"]);
  });

  it("breaks cycles without losing any shape or hanging", () => {
    const stored = [
      rect("a", 0, 0, 10, 10, { groupId: "g1" }),
      rect("b", 0, 0, 10, 10, { groupId: "g2" }),
      rect("c", 0, 0, 10, 10, { groupId: "g3" }),
      group("g1", { groupId: "g2" }),
      group("g2", { groupId: "g3" }),
      group("g3", { groupId: "g1" }),
    ];
    const index = buildGroupIndex(stored);
    expect(index.groups.size).toBe(3);
    // exactly one link was cut, so exactly one group is a root
    const roots = [...index.groups.keys()].filter((id) => !index.parentOf.has(id));
    expect(roots).toHaveLength(1);
    const all = new Set(index.leavesOf.get(roots[0]));
    expect(all).toEqual(new Set(["a", "b", "c"]));
    // and the same input always gives the same repair
    expect([...buildGroupIndex(stored).parentOf.entries()]).toEqual([...index.parentOf.entries()]);
  });

  it("keeps the first of two records with the same id, and a shape beats a record", () => {
    const first = group("g", { name: "first" });
    const index = buildGroupIndex([rect("a", 0, 0, 10, 10, { groupId: "g" }), first, group("g", { name: "second" }), rect("dup", 0, 0), group("dup")]);
    expect(index.groups.get("g")?.name).toBe("first");
    expect(index.groups.has("dup")).toBe(false);
    expect(index.shapes.has("dup")).toBe(true);
  });

  it("copes with a deeply nested chain without recursion limits", () => {
    const stored = [rect("leaf", 0, 0, 10, 10, { groupId: "g0" })];
    for (let i = 0; i < 3000; i += 1) stored.push(group(`g${i}`, i < 2999 ? { groupId: `g${i + 1}` } : {}) as never);
    const index = buildGroupIndex(stored);
    expect(index.groups.size).toBe(3000);
    expect(rootOf(index, "leaf")).toBe("g2999");
  });

  it("builds a large flat board quickly enough to run on every change", () => {
    const stored = Array.from({ length: 5000 }, (_, i) => rect(`s${i}`, i * 10, 0, 8, 8, i % 5 === 0 ? { groupId: `g${(i / 5) % 50}` } : {}));
    for (let g = 0; g < 50; g += 1) stored.push(group(`g${g}`) as never);
    const index = buildGroupIndex(stored);
    expect(index.shapes.size).toBe(5000);
    expect(index.groups.size).toBe(50);
  });
});

describe("ancestry and units", () => {
  const index = buildGroupIndex(nested());

  it("lists ancestors nearest first and finds the root", () => {
    expect(ancestorsOf(index, "b")).toEqual(["inner", "outer"]);
    expect(ancestorsOf(index, "a")).toEqual([]);
    expect(rootOf(index, "b")).toBe("outer");
    expect(rootOf(index, "free")).toBe("free");
  });

  it("resolves what a click selects at the top level", () => {
    expect(unitUnder(index, "b", null)).toBe("outer");
    expect(unitUnder(index, "a", null)).toBe("a");
  });

  it("resolves what a click selects inside an entered group", () => {
    expect(unitUnder(index, "b", "outer")).toBe("inner");
    expect(unitUnder(index, "d", "outer")).toBe("d");
    expect(unitUnder(index, "b", "inner")).toBe("b");
    expect(unitUnder(index, "a", "outer")).toBeNull();
    expect(unitUnder(index, "d", "inner")).toBeNull();
  });

  it("maps a unit to the shapes it stands for", () => {
    expect(leavesOfUnit(index, "outer")).toEqual(["b", "c", "d"]);
    expect(leavesOfUnit(index, "a")).toEqual(["a"]);
    expect(leavesOfUnit(index, "nothing")).toEqual([]);
  });

  it("finds the maximal fully-selected subtrees", () => {
    expect(selectionUnits(index, ["b", "c", "d"])).toEqual(["outer"]);
    expect(selectionUnits(index, ["b", "c"])).toEqual(["inner"]);
    expect(selectionUnits(index, ["b"])).toEqual(["b"]);
    expect(selectionUnits(index, ["b", "d"])).toEqual(["b", "d"]);
    expect(selectionUnits(index, ["a", "b", "c"])).toEqual(["a", "inner"]);
    expect(selectionUnits(index, ["a", "a", "ghost"])).toEqual(["a"]);
  });

  it("expands units back into stacking order without repeats", () => {
    expect(expandUnits(index, ["free", "outer"])).toEqual(["b", "c", "d", "free"]);
    expect(expandUnits(index, ["inner", "b"])).toEqual(["b", "c"]);
  });

  it("filters a raw selection down to shapes that exist", () => {
    expect(selectedShapeIds(index, ["b", "ghost", "b", "inner"])).toEqual(["b"]);
  });

  it("finds the group a set of units should be nested in", () => {
    expect(commonParent(index, ["b", "c"])).toBe("inner");
    expect(commonParent(index, ["inner", "d"])).toBe("outer");
    expect(commonParent(index, ["b", "d"])).toBe("outer");
    expect(commonParent(index, ["a", "b"])).toBeNull();
    expect(commonParent(index, [])).toBeNull();
  });
});

describe("locking", () => {
  it("is inherited from any enclosing group", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "inner" }), rect("b", 0, 0, 10, 10), group("inner", { groupId: "outer" }), group("outer", { locked: true })];
    const index = buildGroupIndex(stored);
    expect(isEffectivelyLocked(index, "a")).toBe(true);
    expect(isEffectivelyLocked(index, "inner")).toBe(true);
    expect(isEffectivelyLocked(index, "b")).toBe(false);
  });

  it("applies to a single locked shape", () => {
    const index = buildGroupIndex([rect("a", 0, 0, 10, 10, { locked: true }), rect("b", 0, 0, 10, 10)]);
    expect(isEffectivelyLocked(index, "a")).toBe(true);
    expect(isEffectivelyLocked(index, "b")).toBe(false);
  });
});

describe("groupLabel", () => {
  it("falls back to Group", () => {
    expect(groupLabel(group("g"))).toBe("Group");
    expect(groupLabel(group("g", { name: "   " }))).toBe("Group");
    expect(groupLabel(group("g", { name: " Auth flow " }))).toBe("Auth flow");
  });
});

import { describe, expect, it } from "vitest";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildGroupIndex, splitStored } from "./group-index";
import {
  deadGroupIds,
  groupsEmptiedBy,
  planDelete,
  planGroup,
  planRenameGroup,
  planSetLocked,
  planUngroup,
  withPrunedGroups,
} from "./group-commands";
import { applyPatch, emptyPatch, mergeStored } from "./patch";
import { arrow, group, rect, viaJson } from "./test-helpers";

let counter = 0;
const ids = () => `g${(counter += 1)}`;

const ids_of = (stored: readonly StoredElement[]) => stored.map((s) => s.id);
const shapeIds = (stored: readonly StoredElement[]) => splitStored(stored).shapes.map((s) => s.id);
const parentIn = (stored: readonly StoredElement[], id: string) => stored.find((s) => s.id === id)?.groupId;

describe("patch semantics", () => {
  it("merges updates and deletes keys set to undefined", () => {
    const merged = mergeStored(rect("a", 0, 0, 10, 10, { groupId: "g", locked: true }), { id: "a", groupId: undefined } as never);
    expect("groupId" in merged).toBe(false);
    expect(merged.locked).toBe(true);
  });

  it("applies update, remove and append in one step", () => {
    const stored = [rect("a", 0, 0), rect("b", 0, 0), rect("c", 0, 0)];
    const next = applyPatch(stored, { add: [rect("d", 0, 0)], update: [{ id: "a", color: "#f00" } as never], remove: ["b"] });
    expect(ids_of(next)).toEqual(["a", "c", "d"]);
    expect(next[0]).toMatchObject({ color: "#f00", type: "rectangle" });
  });
});

describe("planGroup", () => {
  const stored = () => [rect("a", 0, 0), rect("x", 300, 0), rect("b", 150, 0), rect("c", 500, 0)];

  it("groups two shapes: one record, children point at it, stacking order untouched", () => {
    const before = stored();
    const plan = planGroup(before, ["a", "b"], () => "G")!;
    expect(plan.groupId).toBe("G");
    expect(plan.patch.add).toHaveLength(1);
    expect(plan.patch.add[0]).toMatchObject({ id: "G", type: "group" });
    expect(plan.selection).toEqual(["a", "b"]);
    const after = applyPatch(before, plan.patch);
    expect(shapeIds(after)).toEqual(["a", "x", "b", "c"]); // x stays between a and b: z-order preserved
    expect(parentIn(after, "a")).toBe("G");
    expect(parentIn(after, "b")).toBe("G");
    expect(parentIn(after, "x")).toBeUndefined();
    expect(buildGroupIndex(after).leavesOf.get("G")).toEqual(["a", "b"]);
  });

  it("does nothing for fewer than two units or an empty selection", () => {
    expect(planGroup(stored(), ["a"], ids)).toBeNull();
    expect(planGroup(stored(), [], ids)).toBeNull();
    expect(planGroup(stored(), ["ghost", "also-ghost"], ids)).toBeNull();
  });

  it("groups already-grouped selections as single units (nesting)", () => {
    const first = planGroup(stored(), ["a", "b"], () => "G1")!;
    const mid = applyPatch(stored(), first.patch);
    const second = planGroup(mid, ["a", "b", "c"], () => "G2")!;
    const after = applyPatch(mid, second.patch);
    expect(parentIn(after, "G1")).toBe("G2");
    expect(parentIn(after, "c")).toBe("G2");
    expect(parentIn(after, "a")).toBe("G1"); // children of G1 untouched
    const index = buildGroupIndex(after);
    expect(index.leavesOf.get("G2")).toEqual(["a", "b", "c"]);
    expect(index.childrenOf.get("G2")).toEqual(["G1", "c"]);
  });

  it("nests the new group in the deepest group that held all the units", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "outer" }), rect("b", 0, 0, 10, 10, { groupId: "outer" }), rect("c", 0, 0, 10, 10, { groupId: "outer" }), group("outer")];
    const plan = planGroup(start, ["a", "b"], () => "inner")!;
    const after = applyPatch(start, plan.patch);
    expect(parentIn(after, "inner")).toBe("outer");
    expect(buildGroupIndex(after).childrenOf.get("outer")).toEqual(["inner", "c"]);
  });

  it("moves a whole group into the new one when all its shapes are selected (its structure is kept)", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "old" }), rect("b", 0, 0, 10, 10), group("old")];
    const plan = planGroup(start, ["a", "b"], () => "new")!;
    const after = applyPatch(start, plan.patch);
    expect(parentIn(after, "old")).toBe("new");
    expect(parentIn(after, "a")).toBe("old");
    expect(buildGroupIndex(after).childrenOf.get("new")).toEqual(["old", "b"]);
  });

  it("leaves the old group in place when it still has other shapes", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "old" }), rect("a2", 0, 0, 10, 10, { groupId: "old" }), rect("b", 0, 0, 10, 10), group("old")];
    const plan = planGroup(start, ["a", "b"], () => "new")!;
    const after = applyPatch(start, plan.patch);
    expect(after.find((s) => s.id === "old")).toBeDefined();
    expect(buildGroupIndex(after).leavesOf.get("old")).toEqual(["a2"]);
  });

  it("skips locked units", () => {
    const start = [rect("a", 0, 0, 10, 10, { locked: true }), rect("b", 0, 0, 10, 10), rect("c", 0, 0, 10, 10)];
    expect(planGroup(start, ["a", "b"], ids)).toBeNull();
    const plan = planGroup(start, ["a", "b", "c"], () => "G")!;
    expect(plan.selection).toEqual(["b", "c"]);
    expect(applyPatch(start, plan.patch).find((s) => s.id === "a")?.groupId).toBeUndefined();
  });
});

describe("planUngroup", () => {
  const grouped = () => {
    const start = [rect("a", 0, 0), rect("b", 150, 0), rect("c", 300, 0)];
    return applyPatch(start, planGroup(start, ["a", "b", "c"], () => "G")!.patch);
  };

  it("dissolves a group: children keep their ids and become top level", () => {
    const before = grouped();
    const plan = planUngroup(before, ["a", "b", "c"])!;
    expect(plan.groups).toEqual(["G"]);
    expect(plan.selection).toEqual(["a", "b", "c"]);
    const after = applyPatch(before, plan.patch);
    expect(after.find((s) => s.id === "G")).toBeUndefined();
    expect(shapeIds(after)).toEqual(["a", "b", "c"]);
    expect(after.every((s) => s.groupId === undefined)).toBe(true);
  });

  it("only dissolves one level of nesting", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "inner" }), rect("b", 0, 0, 10, 10, { groupId: "inner" }), rect("c", 0, 0, 10, 10, { groupId: "outer" }), group("inner", { groupId: "outer" }), group("outer")];
    const after = applyPatch(start, planUngroup(start, ["a", "b", "c"])!.patch);
    expect(after.find((s) => s.id === "outer")).toBeUndefined();
    expect(parentIn(after, "inner")).toBeUndefined();
    expect(parentIn(after, "c")).toBeUndefined();
    expect(parentIn(after, "a")).toBe("inner");
  });

  it("moves children up into the parent when ungrouping an inner group", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "inner" }), rect("b", 0, 0, 10, 10, { groupId: "inner" }), rect("c", 0, 0, 10, 10, { groupId: "outer" }), group("inner", { groupId: "outer" }), group("outer")];
    const plan = planUngroup(start, ["a", "b"])!;
    const after = applyPatch(start, plan.patch);
    expect(after.find((s) => s.id === "inner")).toBeUndefined();
    expect(parentIn(after, "a")).toBe("outer");
    expect(buildGroupIndex(after).leavesOf.get("outer")).toEqual(["a", "b", "c"]);
  });

  it("ungroups several groups at once", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "g1" }), rect("b", 0, 0, 10, 10, { groupId: "g1" }), rect("c", 0, 0, 10, 10, { groupId: "g2" }), rect("d", 0, 0, 10, 10, { groupId: "g2" }), group("g1"), group("g2")];
    const plan = planUngroup(start, ["a", "b", "c", "d"])!;
    expect(plan.groups.sort()).toEqual(["g1", "g2"]);
    expect(applyPatch(start, plan.patch).some((s) => s.type === "group")).toBe(false);
  });

  it("does nothing for plain shapes, partial selections or locked groups", () => {
    expect(planUngroup([rect("a", 0, 0)], ["a"])).toBeNull();
    expect(planUngroup(grouped(), ["a", "b"])).toBeNull(); // only part of the group is selected
    const locked = grouped().map((s) => (s.id === "G" ? { ...s, locked: true } : s)) as StoredElement[];
    expect(planUngroup(locked, ["a", "b", "c"])).toBeNull();
  });

  it("is the inverse of grouping, even through a save and load", () => {
    const start = [rect("a", 0, 0), rect("b", 150, 0), arrow("ar", "a", "b")];
    const grouped2 = applyPatch(start, planGroup(start, ["a", "b", "ar"], () => "G")!.patch);
    const reloaded = viaJson(grouped2);
    const back = viaJson(applyPatch(reloaded, planUngroup(reloaded, ["a", "b", "ar"])!.patch));
    expect(back).toEqual(viaJson(start));
  });
});

describe("planSetLocked", () => {
  const grouped = () => {
    const start = [rect("a", 0, 0), rect("b", 150, 0), rect("c", 300, 0)];
    return applyPatch(start, planGroup(start, ["a", "b"], () => "G")!.patch);
  };

  it("locks a group by flagging its record, not each child", () => {
    const after = applyPatch(grouped(), planSetLocked(grouped(), ["a", "b"], true)!);
    expect(after.find((s) => s.id === "G")?.locked).toBe(true);
    expect(after.find((s) => s.id === "a")?.locked).toBeUndefined();
  });

  it("locks a plain shape on the shape", () => {
    const after = applyPatch(grouped(), planSetLocked(grouped(), ["c"], true)!);
    expect(after.find((s) => s.id === "c")?.locked).toBe(true);
  });

  it("unlocking clears the unit, what is inside it and locked groups around it", () => {
    const start = [rect("a", 0, 0, 10, 10, { groupId: "inner", locked: true }), rect("b", 0, 0, 10, 10, { groupId: "inner" }), group("inner", { groupId: "outer", locked: true }), group("outer", { locked: true })];
    const after = applyPatch(start, planSetLocked(start, ["a"], false)!);
    expect(after.some((s) => s.locked)).toBe(false);
    expect(viaJson(after).some((s) => "locked" in s)).toBe(false);
  });

  it("is a no-op when nothing changes", () => {
    expect(planSetLocked(grouped(), ["c"], false)).toBeNull();
    const locked = applyPatch(grouped(), planSetLocked(grouped(), ["c"], true)!);
    expect(planSetLocked(locked, ["c"], true)).toBeNull();
    expect(planSetLocked(grouped(), [], true)).toBeNull();
  });
});

describe("planRenameGroup", () => {
  const stored = [rect("a", 0, 0, 10, 10, { groupId: "G" }), group("G", { name: "Old" })];

  it("trims, clears and caps names", () => {
    expect(applyPatch(stored, planRenameGroup(stored, "G", "  New name ")!).find((s) => s.id === "G")).toMatchObject({ name: "New name" });
    const cleared = applyPatch(stored, planRenameGroup(stored, "G", "   ")!);
    expect("name" in viaJson(cleared).find((s) => s.id === "G")!).toBe(false);
    expect((applyPatch(stored, planRenameGroup(stored, "G", "x".repeat(200))!).find((s) => s.id === "G") as { name: string }).name).toHaveLength(80);
  });

  it("does nothing for an unknown group or an unchanged name", () => {
    expect(planRenameGroup(stored, "nope", "x")).toBeNull();
    expect(planRenameGroup(stored, "G", "Old")).toBeNull();
  });
});

describe("planDelete", () => {
  it("removes the shapes and the connectors attached to them", () => {
    const stored = [rect("a", 0, 0), rect("b", 200, 0), arrow("ab", "a", "b"), arrow("free", undefined, undefined)];
    const patch = planDelete(stored, ["a"])!;
    expect(patch.remove.sort()).toEqual(["a", "ab"]);
  });

  it("never removes locked shapes or locked connectors", () => {
    const stored = [rect("a", 0, 0), rect("b", 200, 0, 100, 60, { locked: true }), arrow("ab", "a", "b", { locked: true })];
    expect(planDelete(stored, ["b"])).toBeNull();
    expect(planDelete(stored, ["a"])!.remove).toEqual(["a"]);
  });

  it("removes a group together with its last shape, and the group around it", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "inner" }), rect("b", 0, 0, 10, 10, { groupId: "outer" }), group("inner", { groupId: "outer" }), group("outer")];
    const patch = planDelete(stored, ["a"])!;
    expect(patch.remove.sort()).toEqual(["a", "inner"]);
    const all = planDelete(stored, ["a", "b"])!;
    expect(all.remove.sort()).toEqual(["a", "b", "inner", "outer"]);
    expect(applyPatch(stored, all)).toEqual([]);
  });

  it("keeps a group that still has shapes, even a single one", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "g" }), rect("b", 0, 0, 10, 10, { groupId: "g" }), group("g")];
    const after = applyPatch(stored, planDelete(stored, ["a"])!);
    expect(after.some((s) => s.id === "g")).toBe(true);
    expect(buildGroupIndex(after).leavesOf.get("g")).toEqual(["b"]);
  });

  it("ignores ids that are not shapes", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "g" }), group("g")];
    expect(planDelete(stored, ["g", "nothing"])).toBeNull();
  });

  it("deleting a whole group removes its connectors to the outside too", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "g" }), rect("b", 0, 0, 10, 10, { groupId: "g" }), rect("out", 500, 0), arrow("x", "b", "out"), group("g")];
    const patch = planDelete(stored, ["a", "b"])!;
    expect(patch.remove.sort()).toEqual(["a", "b", "g", "x"]);
  });
});

describe("pruning dead groups", () => {
  it("finds records with no shapes left", () => {
    expect(deadGroupIds([rect("a", 0, 0, 10, 10, { groupId: "live" }), group("live"), group("dead")])).toEqual(["dead"]);
  });

  it("names the groups a removal would empty (used by the storage mutation)", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "g" }), rect("b", 0, 0, 10, 10, { groupId: "h" }), rect("c", 0, 0, 10, 10, { groupId: "h" }), group("g"), group("h")];
    expect(groupsEmptiedBy(stored, new Set(["a"]))).toEqual(["g"]);
    expect(groupsEmptiedBy(stored, new Set(["b"]))).toEqual([]);
    expect(groupsEmptiedBy(stored, new Set(["a", "b", "c"])).sort()).toEqual(["g", "h"]);
  });

  it("does not double-list a removal the patch already holds", () => {
    const stored = [rect("a", 0, 0, 10, 10, { groupId: "g" }), group("g")];
    const patch = withPrunedGroups(stored, { ...emptyPatch(), remove: ["a", "g"] });
    expect(patch.remove).toEqual(["a", "g"]);
  });
});

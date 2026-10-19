import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { cloneElements, collectCopySet } from "@/features/whiteboard/utils/arrange";
import { attachableGroupIds, collectCopyGroups, regroupClones } from "./clone";
import { buildGroupIndex } from "./group-index";
import { arrow, group, rect } from "./test-helpers";

const sequence = (prefix = "n") => {
  let i = 0;
  return () => `${prefix}${(i += 1)}`;
};

const board = () => [
  rect("a", 0, 0, 100, 60, { groupId: "inner" }),
  rect("b", 200, 0, 100, 60, { groupId: "inner" }),
  rect("c", 400, 0, 100, 60, { groupId: "outer" }),
  rect("lone", 0, 300),
  arrow("ab", "a", "b"),
  group("inner", { groupId: "outer", name: "Row" }),
  group("outer", { name: "Panel" }),
];

/** Copy `ids` of `stored` the way duplicate and paste do. */
const duplicate = (stored: ReturnType<typeof board>, ids: string[], attachable?: ReadonlySet<string>) => {
  const sources = collectCopySet(stored.filter((s) => s.type !== "group") as DrawingElement[], new Set(ids));
  const sourceGroups = collectCopyGroups(stored, new Set(sources.map((s) => s.id)));
  const newId = sequence();
  const clones = cloneElements(sources, { dx: 24, dy: 24 }, newId);
  const result = regroupClones(sources, clones, sourceGroups, newId, attachable ?? attachableGroupIds(buildGroupIndex(stored)));
  return { sources, sourceGroups, copies: result.shapes, groups: result.groups };
};

describe("collectCopyGroups", () => {
  it("includes only groups whose shapes are all copied, parents and children alike", () => {
    const stored = board();
    expect(collectCopyGroups(stored, new Set(["a", "b", "c"])).map((g) => g.id)).toEqual(["inner", "outer"]);
    expect(collectCopyGroups(stored, new Set(["a", "b"])).map((g) => g.id)).toEqual(["inner"]);
    expect(collectCopyGroups(stored, new Set(["a"]))).toEqual([]);
    expect(collectCopyGroups(stored, new Set(["lone"]))).toEqual([]);
  });
});

describe("duplicating groups", () => {
  it("clones the whole structure with fresh ids and the same names", () => {
    const { copies, groups, sourceGroups } = duplicate(board(), ["a", "b", "c"]);
    expect(sourceGroups.map((g) => g.id)).toEqual(["inner", "outer"]);
    const all = [...copies.map((s) => s.id), ...groups.map((g) => g.id)];
    expect(new Set(all).size).toBe(all.length);
    for (const original of ["a", "b", "c", "inner", "outer", "ab"]) expect(all).not.toContain(original);
    const inner = groups.find((g) => g.name === "Row")!;
    const outer = groups.find((g) => g.name === "Panel")!;
    expect(inner.groupId).toBe(outer.id);
    expect(outer.groupId).toBeUndefined();
  });

  it("points every copied shape at the cloned groups, never at the originals", () => {
    const { sources, copies, groups } = duplicate(board(), ["a", "b", "c"]);
    const cloned = new Map(groups.map((g) => [g.name, g.id]));
    const byOriginal = new Map(sources.map((s, i) => [s.id, copies[i]]));
    expect(byOriginal.get("a")!.groupId).toBe(cloned.get("Row"));
    expect(byOriginal.get("b")!.groupId).toBe(cloned.get("Row"));
    expect(byOriginal.get("c")!.groupId).toBe(cloned.get("Panel"));
    expect(copies.some((s) => s.id === "lone")).toBe(false);
  });

  it("copies the connector between two grouped shapes and re-points it at the copies", () => {
    const { copies } = duplicate(board(), ["a", "b"]);
    const connector = copies.find((s) => s.type === "arrow") as DrawingElement & {
      startConnection?: { elementId: string };
      endConnection?: { elementId: string };
    };
    expect(connector).toBeDefined();
    const copiedIds = new Set(copies.map((s) => s.id));
    expect(copiedIds.has(connector.startConnection!.elementId)).toBe(true);
    expect(copiedIds.has(connector.endConnection!.elementId)).toBe(true);
    expect(connector.startConnection!.elementId).not.toBe("a");
  });

  it("offsets the copies and leaves the originals untouched", () => {
    const stored = board();
    const before = JSON.stringify(stored);
    const { sources, copies } = duplicate(stored, ["a", "b", "c"]);
    const a = copies[sources.findIndex((s) => s.id === "a")];
    expect(a.points[0]).toEqual({ x: 24, y: 24 });
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("keeps a copy of one child inside the original group when that group is still there", () => {
    const { copies, groups } = duplicate(board(), ["a"]);
    expect(groups).toEqual([]);
    expect(copies[0].groupId).toBe("inner");
  });

  it("puts the copy at the top level when pasting where the group is gone or locked", () => {
    const stored = board();
    expect(duplicate(stored, ["a"], new Set()).copies[0].groupId).toBeUndefined();
    const locked = board().map((s) => (s.id === "outer" ? { ...s, locked: true } : s));
    const attachable = attachableGroupIds(buildGroupIndex(locked as never));
    expect(attachable.has("inner")).toBe(false);
    expect(duplicate(stored, ["a"], attachable).copies[0].groupId).toBeUndefined();
  });

  it("does not carry a dangling group reference", () => {
    const orphan = rect("o", 0, 0, 10, 10, { groupId: "gone" });
    const copies = cloneElements([orphan], { dx: 0, dy: 0 }, sequence());
    expect(regroupClones([orphan], copies, [], sequence(), new Set()).shapes[0].groupId).toBeUndefined();
  });

  it("a cloned group is a valid, independent group once inserted", () => {
    const stored = board();
    const { copies, groups } = duplicate(stored, ["a", "b", "c"]);
    const index = buildGroupIndex([...stored, ...copies, ...groups] as never);
    const copiedOuter = groups.find((g) => g.name === "Panel")!;
    expect(index.leavesOf.get(copiedOuter.id)).toHaveLength(3);
    expect(index.leavesOf.get("outer")).toEqual(["a", "b", "c"]);
  });
});

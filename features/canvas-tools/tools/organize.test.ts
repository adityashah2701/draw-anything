import { describe, expect, it } from "vitest";
import type { GroupRecord } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, groupRecord, idsOf, node, setup } from "../test-helpers";

const three = () => [node("a", "A", 0, 0), node("b", "B", 300, 0), node("c", "C", 600, 0)];

describe("group_elements", () => {
  it("groups with an optional name, keeping positions, order and connectors", async () => {
    const s = setup({ elements: three() });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const before = JSON.stringify(s.mem.stored.map((e) => ("points" in e ? e.points : null)));
    await s.ok("group_elements", { ids: ["a", "b", "c"], name: "All", id: "all" });
    expect(find<GroupRecord>(s.mem.stored, "all")).toMatchObject({ type: "group", name: "All" });
    expect(["a", "b", "c"].every((id) => find(s.mem.stored, id).groupId === "all")).toBe(true);
    expect(JSON.stringify(s.mem.stored.filter((e) => e.id !== "all").map((e) => ("points" in e ? e.points : null)))).toBe(before);
    expect(find(s.mem.stored, "ab")).toMatchObject({ startConnection: { elementId: "a" }, endConnection: { elementId: "b" } });
  });

  it("nests a new group in the group its members share and pulls a unit out of another group", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { groupId: "outer" }), node("b", "B", 300, 0, { groupId: "outer" }), node("c", "C", 600, 0, { groupId: "outer" }), groupRecord("outer")] });
    await s.ok("group_elements", { ids: ["a", "b"], id: "inner" });
    expect(find(s.mem.stored, "inner").groupId).toBe("outer");
    expect(find(s.mem.stored, "a").groupId).toBe("inner");
  });

  it("refuses one element, locked members and unknown ids, changing nothing", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0), node("b", "B", 300, 0, { locked: true }), node("c", "C", 600, 0)] });
    expect((await s.run("group_elements", { ids: ["a"] })).error?.code).toBe("invalid_arguments");
    expect((await s.run("group_elements", { ids: ["a", "b"] })).error?.code).toBe("invalid_state");
    expect((await s.run("group_elements", { ids: ["a", "ghost"] })).error?.code).toBe("not_found");
    expect(s.mem.stored.some((e) => e.type === "group")).toBe(false);
  });
});

describe("ungroup_elements and rename_group", () => {
  const nested = () => [node("a", "A", 0, 0, { groupId: "inner" }), node("b", "B", 300, 0, { groupId: "inner" }), node("c", "C", 600, 0, { groupId: "outer" }), groupRecord("inner", { groupId: "outer", name: "Inner" }), groupRecord("outer", { name: "Outer" })];

  it("dissolves one level only: members move up, nothing moves, no empty record is left", async () => {
    const s = setup({ elements: nested() });
    await s.ok("ungroup_elements", { ids: ["outer"] });
    expect(idsOf(s.mem.stored).includes("outer")).toBe(false);
    expect(find(s.mem.stored, "inner" as never)).toBeTruthy();
    expect(find(s.mem.stored, "c").groupId).toBeUndefined();
    expect(find(s.mem.stored, "inner").groupId).toBeUndefined();
    await s.ok("ungroup_elements", { ids: ["inner"] });
    expect(s.mem.stored.some((e) => e.type === "group")).toBe(false);
    expect(boxOf(find(s.mem.stored, "b"))).toMatchObject({ x: 300, y: 0 });
  });

  it("rejects shapes, unknown ids and locked groups", async () => {
    const s = setup({ elements: nested() });
    expect((await s.run("ungroup_elements", { ids: ["a"] })).error?.code).toBe("invalid_state");
    expect((await s.run("ungroup_elements", { ids: ["ghost"] })).error?.code).toBe("not_found");
    await s.ok("lock_elements", { ids: ["outer"] });
    expect((await s.run("ungroup_elements", { ids: ["outer"] })).error?.code).toBe("locked");
  });

  it("renames a group, resets an empty name, and ignores shapes", async () => {
    const s = setup({ elements: nested() });
    await s.ok("rename_group", { id: "inner", name: "  Services " });
    expect(find<GroupRecord>(s.mem.stored, "inner").name).toBe("Services");
    await s.ok("rename_group", { id: "inner", name: "" });
    expect(find<GroupRecord>(s.mem.stored, "inner").name).toBeUndefined();
    expect((await s.ok("rename_group", { id: "outer", name: "Outer" })).summary).toContain("already");
    expect((await s.run("rename_group", { id: "a", name: "x" })).error?.code).toBe("invalid_state");
    expect((await s.run("rename_group", { id: "ghost", name: "x" })).error?.code).toBe("not_found");
    expect((await s.run("rename_group", { id: "inner", name: "x".repeat(81) })).error?.code).toBe("invalid_arguments");
  });
});

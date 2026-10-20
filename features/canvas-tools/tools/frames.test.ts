import { describe, expect, it } from "vitest";
import { boxOf, find, node, setup } from "../test-helpers";

const board = () => [node("web", "Web App", 100, 100), node("api", "API", 400, 100), node("db", "Database", 400, 400), node("queue", "Queue", 700, 100)];

const framed = async () => {
  const s = setup({ elements: board() });
  await s.ok("create_connector", { id: "w-a", from: "web", to: "api" });
  await s.ok("create_connector", { id: "a-d", from: "api", to: "db" });
  await s.ok("create_frame_or_section", { id: "be", title: "Backend", ids: ["api", "db"] });
  return s;
};

describe("create_frame_or_section", () => {
  it("frames existing nodes without recreating them: same ids, positions and connectors", async () => {
    const s = await framed();
    expect(find(s.mem.stored, "api")).toMatchObject({ frameId: "be", label: "API" });
    expect(boxOf(find(s.mem.stored, "api") as never)).toMatchObject({ x: 400, y: 100 });
    expect(find(s.mem.stored, "a-d")).toMatchObject({ startConnection: { elementId: "api" }, endConnection: { elementId: "db" } });
    expect(s.mem.stored.filter((e) => e.type === "frame")).toHaveLength(1);
  });

  it("nests a frame made around members that are all in another frame", async () => {
    const s = await framed();
    await s.ok("create_frame_or_section", { id: "inner", title: "Data", ids: ["db"] });
    expect(find(s.mem.stored, "inner")).toMatchObject({ frameId: "be" });
    expect(find(s.mem.stored, "db")).toMatchObject({ frameId: "inner" });
  });

  it("refuses an unknown element, a taken id, and both ids and bounds, changing nothing", async () => {
    const s = await framed();
    const before = s.mem.stored;
    expect((await s.run("create_frame_or_section", { title: "X", ids: ["ghost"] })).error?.code).toBe("not_found");
    expect((await s.run("create_frame_or_section", { id: "be", title: "X", ids: ["web"] })).error?.code).toBe("conflict");
    expect((await s.run("create_frame_or_section", { title: "X", ids: ["web"], bounds: { x: 0, y: 0, width: 10, height: 10 } })).error?.code).toBe("invalid_arguments");
    expect(s.mem.stored).toBe(before);
  });

  it("refuses to frame a locked element", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0, { locked: true })] });
    const result = await s.run("create_frame_or_section", { title: "X", ids: ["a"] });
    expect(result.ok).toBe(false);
  });
});

describe("update_frame", () => {
  it("renames a frame and moves nothing", async () => {
    const s = await framed();
    const before = s.mem.stored.filter((e) => e.id !== "be");
    await s.ok("update_frame", { id: "be", title: "Backend services" });
    expect(find(s.mem.stored, "be")).toMatchObject({ title: "Backend services" });
    expect(s.mem.stored.filter((e) => e.id !== "be")).toEqual(before);
  });

  it("restyles, turns auto-fit on, and nests a frame", async () => {
    const s = await framed();
    await s.ok("create_frame_or_section", { id: "all", title: "System", bounds: { x: -100, y: -100, width: 1200, height: 800 } });
    await s.ok("update_frame", { id: "be", color: "blue", fill: "#eef", auto_fit: true, parent: "all" });
    expect(find(s.mem.stored, "be")).toMatchObject({ color: "#2563eb", autoFit: true, frameId: "all" });
  });

  it("says what is wrong for a shape, an empty change, and a cycle", async () => {
    const s = await framed();
    expect((await s.run("update_frame", { id: "web", title: "x" })).error).toMatchObject({ code: "invalid_state" });
    expect((await s.run("update_frame", { id: "be" })).error?.code).toBe("invalid_arguments");
    await s.ok("create_frame_or_section", { id: "inner", title: "Data", ids: ["db"] });
    const cycle = await s.run("update_frame", { id: "be", parent: "inner" });
    expect(cycle.ok).toBe(false);
    expect(cycle.error?.code).toBe("invalid_state");
    expect(find(s.mem.stored, "be")).not.toHaveProperty("frameId", "inner");
  });

  it("rename_group points at update_frame for a frame", async () => {
    const s = await framed();
    expect((await s.run("rename_group", { id: "be", name: "x" })).error?.message).toMatch(/update_frame/);
  });
});

describe("add_to_frame, remove_from_frame, fit_frame", () => {
  it("adds a node to the frame and fits the frame around it, without moving the node", async () => {
    const s = await framed();
    const result = await s.ok("add_to_frame", { frame: "be", ids: ["queue"] });
    expect(find(s.mem.stored, "queue")).toMatchObject({ frameId: "be" });
    expect(boxOf(find(s.mem.stored, "queue") as never).x).toBe(700);
    const frame = boxOf(find(s.mem.stored, "be") as never);
    expect(frame.x + frame.w).toBeGreaterThanOrEqual(868);
    expect(result.data).toMatchObject({ added: ["queue"] });
  });

  it("keeps the size with fit: false, and reports an element already there as skipped", async () => {
    const s = await framed();
    const size = boxOf(find(s.mem.stored, "be") as never);
    const result = await s.ok("add_to_frame", { frame: "be", ids: ["queue", "api"], fit: false });
    expect(boxOf(find(s.mem.stored, "be") as never)).toEqual(size);
    expect(result.skipped).toEqual([{ id: "api", reason: "already there" }]);
  });

  it("takes an element out without moving or deleting it", async () => {
    const s = await framed();
    const before = JSON.stringify(boxOf(find(s.mem.stored, "db") as never));
    await s.ok("remove_from_frame", { ids: ["db"] });
    expect(find(s.mem.stored, "db")).not.toHaveProperty("frameId", "be");
    expect(JSON.stringify(boxOf(find(s.mem.stored, "db") as never))).toBe(before);
  });

  it("fit_frame wraps members that moved, and fits to the new place", async () => {
    const s = await framed();
    await s.ok("move_elements", { ids: ["db"], dy: 300 });
    const before = boxOf(find(s.mem.stored, "be") as never);
    await s.ok("fit_frame", { frame: "be" });
    const after = boxOf(find(s.mem.stored, "be") as never);
    expect(after.y + after.h).toBeGreaterThan(before.y + before.h);
  });

  it("refuses locked frames, unknown frames and shapes with a reason", async () => {
    const s = await framed();
    expect((await s.run("add_to_frame", { frame: "ghost", ids: ["web"] })).error?.code).toBe("not_found");
    expect((await s.run("add_to_frame", { frame: "web", ids: ["queue"] })).error?.code).toBe("invalid_state");
    await s.ok("lock_elements", { ids: ["be"] });
    expect((await s.run("add_to_frame", { frame: "be", ids: ["queue"] })).error?.code).toBe("locked");
  });
});

describe("resize_frame", () => {
  it("sets the box and warns about members left outside", async () => {
    const s = await framed();
    const result = await s.ok("resize_frame", { id: "be", width: 100 });
    expect(boxOf(find(s.mem.stored, "be") as never).w).toBeGreaterThanOrEqual(100);
    expect(result.warnings?.join(" ")).toMatch(/stick out/);
  });

  it("is refused for an auto-fit frame, with the way out", async () => {
    const s = await framed();
    await s.ok("update_frame", { id: "be", auto_fit: true });
    const result = await s.run("resize_frame", { id: "be", width: 900 });
    expect(result.error?.code).toBe("invalid_state");
    expect(result.error?.message).toMatch(/auto_fit: false/);
    expect((await s.run("resize_frame", { id: "be" })).error?.code).toBe("invalid_arguments");
  });
});

describe("moving and deleting a frame", () => {
  it("move_elements carries the frame with everything in it", async () => {
    const s = await framed();
    await s.ok("move_elements", { ids: ["be"], dx: 50, dy: 20 });
    expect(boxOf(find(s.mem.stored, "api") as never)).toMatchObject({ x: 450, y: 120 });
    expect(boxOf(find(s.mem.stored, "db") as never)).toMatchObject({ x: 450, y: 420 });
    expect(boxOf(find(s.mem.stored, "web") as never)).toMatchObject({ x: 100, y: 100 });
    expect(find(s.mem.stored, "api")).toMatchObject({ frameId: "be" });
  });

  it("delete_frame keeps the contents by default", async () => {
    const s = await framed();
    await s.ok("delete_frame", { id: "be" });
    expect(s.mem.stored.some((e) => e.id === "be")).toBe(false);
    expect(find(s.mem.stored, "api")).toBeDefined();
    expect(find(s.mem.stored, "api")).not.toHaveProperty("frameId", "be");
    expect(find(s.mem.stored, "a-d")).toBeDefined();
  });

  it('delete_frame with contents "delete" removes them and their connectors', async () => {
    const s = await framed();
    await s.ok("delete_frame", { id: "be", contents: "delete" });
    expect(s.mem.stored.map((e) => e.id).sort()).toEqual(["queue", "web"]);
  });

  it("is guarded by the revision: a changed board must be re-read first", async () => {
    const s = await framed();
    await s.ok("get_document_state", {});
    await s.mem.host.applyPatch({ add: [node("other", "Other", 900, 900)], update: [], remove: [] });
    const result = await s.run("delete_frame", { id: "be" });
    expect(result.error?.code).toBe("stale_document");
    expect(find(s.mem.stored, "be")).toBeDefined();
  });
});

describe("list_frames and the document state", () => {
  it("lists frames, and what one holds", async () => {
    const s = await framed();
    await s.ok("create_frame_or_section", { id: "inner", title: "Data", ids: ["db"] });
    const all = await s.ok("list_frames", {});
    expect((all.data as { frames: Array<{ id: string; parent: string | null }> }).frames.map((f) => [f.id, f.parent])).toEqual([["be", null], ["inner", "be"]]);
    const one = await s.ok("list_frames", { frame: "be" });
    expect((one.data as { items: Array<{ id: string }> }).items.map((i) => i.id).sort()).toEqual(["api", "inner"]);
    const deep = await s.ok("list_frames", { frame: "be", deep: true });
    expect((deep.data as { items: Array<{ id: string }> }).items.map((i) => i.id)).toContain("db");
  });

  it("get_document_state shows frames with their members, and each element's frame", async () => {
    const s = await framed();
    const state = (await s.ok("get_document_state", {})).data as { frames: Array<{ id: string; members: string[] }>; elements: Array<{ id: string; frame?: string }> };
    expect(state.frames).toMatchObject([{ id: "be" }]);
    expect(state.frames[0].members).toEqual(expect.arrayContaining(["api", "db"]));
    expect(state.elements.find((e) => e.id === "api")?.frame).toBe("be");
  });

  it("validate_diagram finds nothing wrong with a framed diagram", async () => {
    const s = await framed();
    const issues = ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string }> }).issues.filter((i) => i.code !== "misaligned_connection" && i.code !== "uneven_spacing");
    expect(issues).toEqual([]);
  });
});

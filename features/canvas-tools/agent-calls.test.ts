import { describe, expect, it } from "vitest";
import { normalizeArgs } from "./args";
import { call, reply, scriptedRun } from "./agent/test-support";
import { buildTools } from "./registry";
import { find, node, setup } from "./test-helpers";

const tools = buildTools(() => undefined);
const tool = (name: string) => tools.find((t) => t.name === name)!;

describe("argument names a model guesses", () => {
  it("reads frame_id / member_ids as frame / ids for fit_frame", () => {
    expect(normalizeArgs(tool("fit_frame"), { frame_id: "fr", member_ids: ["a", "b"] })).toEqual({ args: { frame: "fr", ids: ["a", "b"] }, read: ["frame_id as frame", "member_ids as ids"] });
    expect(normalizeArgs(tool("fit_frame"), { frameId: "fr", elementIds: ["a"] }).args).toEqual({ frame: "fr", ids: ["a"] });
  });

  it("does not guess when the real name is already given or nothing fits", () => {
    expect(normalizeArgs(tool("fit_frame"), { frame: "fr", frame_id: "other", ids: ["a"] }).args).toEqual({ frame: "fr", frame_id: "other", ids: ["a"] });
    expect(normalizeArgs(tool("fit_frame"), { color: "red", frame: "fr", ids: ["a"] }).read).toEqual([]);
  });

  it("an executor call with guessed names works and says how it was read", async () => {
    const s = setup({ elements: [node("auth", "Auth", 100, 100), node("orders", "Orders", 400, 100)] });
    await s.ok("create_frame_or_section", { title: "Services", ids: ["auth", "orders"], id: "fr" });
    await s.ok("move_elements", { ids: ["orders"], dx: 100 });
    const fitted = await s.executor.execute({ id: "f1", name: "fit_frame", args: { frame_id: "fr", member_ids: ["auth", "orders"] } });
    expect(fitted.ok).toBe(true);
    expect(fitted.warnings?.join(" ")).toMatch(/Read frame_id as frame, member_ids as ids/);
  });

  it("still names the real arguments when the guess is wrong", async () => {
    const s = setup({ elements: [node("a", "A", 0, 0)] });
    const bad = await s.executor.execute({ id: "f2", name: "fit_frame", args: { box: "x" } });
    expect(bad.ok).toBe(false);
    expect(bad.error?.message).toMatch(/takes only: frame, ids/);
  });
});

describe("fit_frame is there when the work is editing", () => {
  it("an edit request can fit the frame without enabling more tools first", async () => {
    const before = setup({ elements: [node("auth", "Auth", 100, 100), node("orders", "Orders", 400, 100)] });
    await before.ok("create_frame_or_section", { title: "Services", ids: ["auth", "orders"], id: "fr" });
    const { run, mem } = await scriptedRun({
      prompt: "Move Orders to the right",
      board: { elements: before.mem.stored as never },
      script: [
        reply("", [call("move_elements", { ids: ["orders"], dx: 80 })]),
        reply("", [call("fit_frame", { frame_id: "fr", member_ids: ["auth", "orders"] })]),
        reply("Done."),
      ],
    });
    const failed = run.results.filter((r) => !r.ok).map((r) => `${r.tool}:${r.error?.code}`);
    expect(failed.filter((f) => f.startsWith("fit_frame"))).toEqual([]);
    expect(run.results.some((r) => r.tool === "fit_frame" && r.ok)).toBe(true);
    expect(find<any>(mem.stored, "fr").points[1].x).toBeGreaterThan(560);
  });
});

describe("placing things near frames", () => {
  const framed = async () => {
    const s = setup({ elements: [node("auth", "Auth", 100, 100), node("orders", "Orders", 400, 100)] });
    await s.ok("create_frame_or_section", { title: "Services", ids: ["auth", "orders"], id: "fr" });
    return s;
  };

  it("warns when a new icon or node sits against a frame, and not when it keeps clear", async () => {
    const s = await framed();
    const frame = find<any>(s.mem.stored, "fr");
    const edge = Math.max(...frame.points.map((p: { x: number }) => p.x));
    const crowded = await s.ok("create_icon", { icon: "dashboard", x: edge + 10, y: 100, id: "mon" });
    expect(crowded.warnings?.join(" ")).toMatch(/crowds the frame "fr"/);
    const clear = await s.ok("create_icon", { icon: "dashboard", x: edge + 120, y: 100, id: "mon2" });
    expect(clear.warnings ?? []).toEqual([]);
    const node1 = await s.ok("create_semantic_node", { id: "q", label: "Queue", x: edge + 5, y: 120 });
    expect(node1.warnings?.join(" ")).toMatch(/crowds the frame/);
  });

  it("the validator names a connector that crosses a frame neither of its ends is in", async () => {
    const s = setup({ elements: [node("a", "A", 0, 200), node("b", "B", 900, 200), node("x", "X", 400, 200)] });
    await s.ok("create_frame_or_section", { title: "Inner", ids: ["x"], id: "fr" });
    await s.ok("create_connector", { id: "ab", from: "a", to: "b" });
    const issues = ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string; ids: string[] }> }).issues;
    expect(issues.find((i) => i.code === "connector_through_frame")?.ids).toContain("ab");
  });
});

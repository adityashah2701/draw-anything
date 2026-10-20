import { describe, expect, it } from "vitest";
import { call, reply, scriptedRun } from "./agent/test-support";
import { coerceArgs } from "./args";
import { buildTools } from "./registry";
import { boxOf, find, node, setup } from "./test-helpers";

const tools = buildTools(() => undefined);
const tool = (name: string) => tools.find((t) => t.name === name)!;
const board = () => [node("a", "A", 0, 0), node("b", "B", 300, 0)];

describe("values a model writes in the wrong JSON type", () => {
  it("reads numbers and booleans sent as text, one id as a list, a list sent as JSON text, and null as not given", () => {
    const { args, adjusted } = coerceArgs(tool("move_elements"), { ids: "a", dx: "50", dy: null, skip_locked: "true" });
    expect(args).toEqual({ ids: ["a"], dx: 50, skip_locked: true });
    expect(adjusted.join(" ")).toMatch(/ids.*single value/);
    expect(adjusted.join(" ")).toMatch(/dy \(null left out\)/);
    expect(coerceArgs(tool("move_elements"), { ids: '["a","b"]', dx: 5 }).args).toEqual({ ids: ["a", "b"], dx: 5 });
  });

  it("leaves what already fits, and what is ambiguous, alone", () => {
    const fine = { ids: ["a"], dx: 5 };
    expect(coerceArgs(tool("move_elements"), fine)).toEqual({ args: fine, adjusted: [] });
    // Text for a text argument stays text, even when it looks like a number.
    expect(coerceArgs(tool("rename_group"), { id: "g1", name: "42" }).args).toEqual({ id: "g1", name: "42" });
    // A wrong type that cannot be read stays wrong, for the schema to name.
    expect(coerceArgs(tool("move_elements"), { ids: ["a"], dx: "far" }).args).toEqual({ ids: ["a"], dx: "far" });
  });

  it("runs the call and tells the model what was adjusted", async () => {
    const s = setup({ elements: board() });
    const result = await s.run("move_elements", { ids: "a", dx: "50", dy: null });
    expect(result.ok).toBe(true);
    expect(boxOf(find(s.mem.stored, "a") as never).x).toBe(50);
    expect(result.warnings?.join(" ")).toMatch(/Adjusted/);
  });

  it("still refuses what is wrong, with the real argument names", async () => {
    const s = setup({ elements: board() });
    const result = await s.run("move_elements", { ids: ["a"], dx: "far" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_arguments");
    expect(result.error?.message).toMatch(/takes only/);
  });
});

describe("repeated work", () => {
  it("answers an icon search again from the run's cache even after the board changed", async () => {
    const s = setup({ elements: board() });
    const first = await s.run("search_icons", { query: "kafka" });
    await s.ok("move_elements", { ids: ["a"], dx: 10 });
    const again = await s.run("search_icons", { query: "kafka" });
    expect(first.data).toBeDefined();
    expect(again.data).toEqual({ repeated: true });
    expect(again.summary).toMatch(/asked this before/);
    expect(again.summary).toContain(first.summary.slice(0, 40));
  });

  it("still re-reads the board after it changed", async () => {
    const s = setup({ elements: board() });
    await s.ok("get_document_state", {});
    await s.ok("move_elements", { ids: ["a"], dx: 10 });
    const again = await s.run("get_document_state", {});
    expect((again.data as { repeated?: boolean }).repeated).toBeUndefined();
  });
});

describe("a run that only looks", () => {
  const looks = ["get_document_state", "validate_diagram", "find_elements", "get_selection", "serialize_diagram", "search_icons", "get_element_details", "zoom_to_fit", "get_document_state", "validate_diagram", "find_elements", "get_selection"];
  const script = looks.map((name, i) =>
    reply("", [call(name, name === "find_elements" ? { query: `q${i}` } : name === "search_icons" ? { query: `term${i}` } : name === "get_element_details" ? { ids: ["a"] } : name === "serialize_diagram" ? { format: "diagram_code" } : {})]),
  );

  it("is told after six steps to act or answer, and ended after ten", async () => {
    const { run } = await scriptedRun({ prompt: "Look at it", board: { elements: board() }, script });
    const seen = run.messages.flatMap((m) => (m.role === "tool" ? [m.content] : []));
    expect(run.status).toBe("stalled");
    expect(run.steps).toBe(10);
    expect(run.error).toMatch(/without changing anything/);
    expect(seen.some((w) => /6 steps in a row only looked/.test(w))).toBe(true);
    // The stop is not a failure of the board: nothing changed.
    expect(run.totals.created + run.totals.updated + run.totals.removed).toBe(0);
  });

  it("is not stopped when the looking is followed by a change", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Move A",
      board: { elements: board() },
      script: [...script.slice(0, 5), reply("", [call("move_elements", { ids: ["a"], dx: 10 })]), reply("Done.")],
    });
    expect(run.status).toBe("done");
    expect(boxOf(find(mem.stored, "a") as never).x).toBe(10);
  });
});

describe("a failed change leaves the board whole", () => {
  it("keeps the earlier change of the reply, skips the rest, and the failed one changes nothing", async () => {
    const s = setup({ elements: board() });
    const before = s.mem.stored;
    const results = await s.executor.executeAll([
      { id: "1", name: "move_elements", args: { ids: ["a"], dx: 10 } },
      { id: "2", name: "move_elements", args: { ids: ["missing"], dx: 10 } },
      { id: "3", name: "move_elements", args: { ids: ["b"], dx: 10 } },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false, false]);
    expect(results[2].error?.code).toBe("skipped");
    expect(boxOf(find(s.mem.stored, "a") as never).x).toBe(10);
    expect(find(s.mem.stored, "b")).toBe(find(before, "b"));
  });

  it("a host that rejects the write leaves the board as it was", async () => {
    const s = setup({ elements: board() });
    const before = s.mem.stored;
    const real = s.mem.host.applyPatch;
    s.mem.host.applyPatch = () => {
      throw new Error("storage offline");
    };
    const result = await s.run("move_elements", { ids: ["a"], dx: 10 });
    s.mem.host.applyPatch = real;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("execution_failed");
    expect(s.mem.stored).toBe(before);
  });
});

describe("sequential mutations", () => {
  it("many calls started at once apply one after the other, none lost", async () => {
    const s = setup({ elements: board() });
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => s.run("move_elements", { ids: ["a"], dx: n })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(boxOf(find(s.mem.stored, "a") as never).x).toBe(15);
  });
});

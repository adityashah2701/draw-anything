import { describe, expect, it } from "vitest";
import { call, reply, scriptedRun } from "./agent/test-support";
import { createMemoryHost } from "./memory-host";
import { createCanvasTools } from "./runtime";
import { ALL_GROUPS, boxOf, find, idsOf, node, rectangle, setup } from "./test-helpers";
import type { CanvasHost } from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The screenshot's board: a column of nodes joined by connectors. */
const column = () => [node("orders", "Orders", 100, 0), node("cache", "Redis Cache", 100, 150), node("queue", "Message Queue", 100, 300), node("db", "Orders DB", 100, 450)];
const wired = async (extra: Parameters<typeof setup>[0] = {}) => {
  const s = setup({ elements: column(), ...extra });
  for (const [id, from, to] of [["c1", "orders", "cache"], ["c2", "cache", "queue"], ["c3", "queue", "db"]]) await s.ok("create_connector", { id, from, to });
  return s;
};
const issuesOf = async (s: Awaited<ReturnType<typeof wired>>) => ((await s.ok("validate_diagram", {})).data as { issues: Array<{ code: string }> }).issues.map((i) => i.code);

describe("one executor per board", () => {
  it("serializes overlapping calls: each reads the board the previous one left, so no move is lost", async () => {
    const mem = createMemoryHost({ elements: [node("a", "A", 0, 0)] });
    const slow: CanvasHost = { ...mem.host, applyPatch: async (patch) => { await wait(15); return mem.host.applyPatch(patch); } };
    const first = createCanvasTools({ host: slow, groups: ALL_GROUPS });
    const second = createCanvasTools({ host: slow, groups: ALL_GROUPS });
    const results = await Promise.all([
      first.execute({ id: "m1", name: "move_elements", args: { ids: ["a"], dx: 10 } }),
      second.execute({ id: "m2", name: "move_elements", args: { ids: ["a"], dx: 10 } }),
      first.execute({ id: "m3", name: "move_elements", args: { ids: ["a"], dy: 5 } }),
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(boxOf(find(mem.stored, "a") as never)).toMatchObject({ x: 20, y: 5 });
  });
});

describe("stale revisions", () => {
  it("accepts a guard from this run's own earlier change, as when a reply holds several moves", async () => {
    const s = await wired();
    const start = (await s.ok("get_document_state", {})).revision;
    const results = await s.executor.executeAll([
      { id: "a", name: "move_elements", args: { ids: ["orders"], dx: 40, expected_revision: start } },
      { id: "b", name: "move_elements", args: { ids: ["db"], dx: 40, expected_revision: start } },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it("refuses a guard after someone else edited, and says what to do", async () => {
    const s = await wired();
    const start = (await s.ok("get_document_state", {})).revision;
    await s.mem.host.applyPatch({ add: [rectangle("other", 900, 900)], update: [], remove: [] });
    const result = await s.run("move_elements", { ids: ["orders"], dx: 40, expected_revision: start });
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ code: "stale_document", details: { revision: expect.any(String) } });
    expect(result.error?.message).toMatch(/get_document_state.*without expected_revision/);
    expect(boxOf(find(s.mem.stored, "orders") as never).x).toBe(100);
  });
});

describe("tool selection and arguments", () => {
  it("answers an invented argument with the tool's real arguments", async () => {
    const s = await wired();
    const result = await s.run("validate_diagram", { expected_revision: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_arguments");
    expect(result.error?.message).toMatch(/unknown argument.*expected_revision/);
    expect(result.error?.message).toMatch(/takes only: /);
    expect((await s.run("validate_diagram", {})).ok).toBe(true);
  });

  it("refuses unregistered and not-enabled tools and names the way out", async () => {
    const s = setup({ elements: column(), groups: ["inspect" as never] });
    expect((await s.run("make_it_pretty", {})).error?.code).toBe("unknown_tool");
    const off = await s.run("move_elements", { ids: ["orders"], dx: 1 });
    expect(off.error).toMatchObject({ code: "tool_not_enabled" });
    expect(off.error?.message).toMatch(/on now, so call move_elements again/);
    expect((await s.run("move_elements", { ids: ["orders"], dx: 1 })).ok).toBe(true);
  });

  it("does not repeat a read on a board that has not changed, and reads again after a change", async () => {
    const s = await wired();
    const first = await s.ok("get_document_state", {});
    const again = await s.ok("get_document_state", {});
    expect(first.data).not.toMatchObject({ repeated: true });
    expect(again.data).toEqual({ repeated: true });
    expect(again.summary).toMatch(/Nothing has changed/);
    await s.ok("move_elements", { ids: ["db"], dy: 20 });
    expect((await s.ok("get_document_state", {})).data).not.toMatchObject({ repeated: true });
  });
});

describe("bulk moves keep connectors whole", () => {
  it("moves several nodes in one call and every connector still reaches its shapes without crossing one", async () => {
    const s = await wired();
    const result = await s.ok("move_elements", { ids: ["cache", "queue", "db"], dx: 260 });
    expect(result.affected.updated.length).toBeGreaterThanOrEqual(3);
    const codes = await issuesOf(s);
    for (const bad of ["stale_connector", "dangling_connector", "connector_through_node"]) expect(codes).not.toContain(bad);
  });

  it("a layout over the whole board leaves a clean board in one undo step", async () => {
    const s = await wired();
    await s.ok("tidy_diagram", {});
    await s.ok("auto_layout", { algorithm: "layered" });
    expect(await issuesOf(s)).toEqual([]);
  });
});

describe("the agent loop under the screenshot's failure sequence", () => {
  it("recovers from a stale guard and an invented argument, and finishes within budget", async () => {
    const board = { elements: column() };
    const { run, mem } = await scriptedRun({
      prompt: "Move the database and queue apart",
      board,
      script: [
        reply("Spacing them.", [call("move_elements", { ids: ["db"], dy: 40 })]),
        ({ results }) => reply("Next.", [call("move_elements", { ids: ["queue"], dy: -40, expected_revision: "0badf00d" })]),
        ({ results }) => (results[0]?.error?.code === "stale_document" ? reply("Retrying without the guard.", [call("move_elements", { ids: ["queue"], dy: -40 })]) : reply("unexpected")),
        reply("Checking.", [call("validate_diagram", { expected_revision: "x" })]),
        ({ results }) => (results[0]?.error?.message?.includes("takes only") ? reply("Checking properly.", [call("validate_diagram", {})]) : reply("unexpected")),
        reply("Done."),
      ],
    });
    expect(run.status).toBe("done");
    expect(run.results.filter((r) => !r.ok).map((r) => r.error?.code)).toEqual(["stale_document", "invalid_arguments"]);
    expect(boxOf(find(mem.stored, "db") as never).y).toBe(490);
    expect(boxOf(find(mem.stored, "queue") as never).y).toBe(260);
  });
});

describe("stalls, budgets and continuation", () => {
  it("stops an agent asking the same thing of an unchanged board", async () => {
    const look = reply("", [call("get_document_state")]);
    const { run } = await scriptedRun({ prompt: "Look", board: { elements: column() }, script: Array(10).fill(look) });
    expect(run.status).toBe("stalled");
    expect(run.steps).toBe(4);
    expect(run.error).toMatch(/same thing/);
  });

  it("ends on the tool-call budget, keeps the changes and says how to continue", async () => {
    const moves = [0, 1, 2, 3].map((i) => reply("", [call("move_elements", { ids: ["db"], dy: 10 + i })]));
    const { run, mem } = await scriptedRun({ prompt: "Nudge", board: { elements: column() }, script: moves, budget: { toolCalls: 2 } });
    expect(run).toMatchObject({ status: "max_steps", limit: "tool_calls" });
    expect(run.error).toMatch(/say "continue"/);
    expect(boxOf(find(mem.stored, "db") as never).y).toBe(450 + 10 + 11);
  });

  const looking = ["orders", "cache", "queue", "db"].map((id) => reply("", [call("get_element_details", { ids: [id] })]));

  it("ends when the board has not changed for the time budget, keeping the changes", async () => {
    let t = 0;
    const { run, mem } = await scriptedRun({
      prompt: "Nudge the database",
      board: { elements: column() },
      now: () => (t += 60),
      budget: { ms: 150 },
      script: [reply("", [call("move_elements", { ids: ["db"], dy: 5 })]), ...looking],
    });
    expect(run).toMatchObject({ status: "max_steps", limit: "time" });
    expect(run.error).toMatch(/without changing the board/);
    expect(boxOf(find(mem.stored, "db") as never).y).toBeGreaterThan(450);
  });

  it("a slow model that keeps changing the board is not cut off by the idle budget", async () => {
    let t = 0;
    const { run } = await scriptedRun({
      prompt: "Nudge the database",
      board: { elements: column() },
      now: () => (t += 60),
      budget: { ms: 150 },
      script: [5, 6, 7, 8, 9].map((dy) => reply("", [call("move_elements", { ids: ["db"], dy })])).concat([reply("Done.")]),
    });
    expect(run.status).toBe("done");
  });

  it("still stops a run that goes on past the absolute ceiling", async () => {
    let t = 0;
    const { run } = await scriptedRun({
      prompt: "Nudge the database",
      board: { elements: column() },
      now: () => (t += 60),
      budget: { ms: 10_000, maxMs: 400 },
      script: [5, 6, 7, 8, 9, 10, 11, 12].map((dy) => reply("", [call("move_elements", { ids: ["db"], dy })])),
    });
    expect(run).toMatchObject({ status: "max_steps", limit: "time" });
    expect(run.error).toMatch(/in total/);
  });

  it("a second run continues from the board and the history it was given", async () => {
    const first = await scriptedRun({ prompt: "Nudge", board: { elements: column() }, script: [reply("", [call("move_elements", { ids: ["db"], dy: 10 })]), reply("", [call("move_elements", { ids: ["db"], dy: 11 })])], budget: { toolCalls: 1 } });
    expect(first.run.limit).toBe("tool_calls");
    const second = await scriptedRun({ prompt: "Please move the database, continue", board: { elements: first.mem.stored.filter((e) => e.type !== "group") as never }, history: first.run.messages.slice(0, -1) as never, script: [reply("", [call("move_elements", { ids: ["db"], dy: 11 })]), reply("Finished.")] });
    expect(second.run.status).toBe("done");
    expect(boxOf(find(second.mem.stored, "db") as never).y).toBe(450 + 10 + 11);
  });

  it("keeps earlier changes when a later step fails, and undoes the whole run on request", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Move then fail",
      board: { elements: column() },
      script: [reply("", [call("move_elements", { ids: ["db"], dy: 30 }), call("move_elements", { ids: ["ghost"], dy: 5 }), call("move_elements", { ids: ["queue"], dy: 5 })]), reply("The second move failed; the first is kept.")],
    });
    expect(run.results.map((r) => r.ok)).toEqual([true, false, false]);
    expect(run.results[2].error?.code).toBe("skipped");
    expect(boxOf(find(mem.stored, "db") as never).y).toBe(480);
    await mem.host.undo!();
    expect(boxOf(find(mem.stored, "db") as never).y).toBe(450);
    await mem.host.redo!();
    expect(boxOf(find(mem.stored, "db") as never).y).toBe(480);
  });

  it("an aborted run keeps what it already did", async () => {
    const controller = new AbortController();
    const { run, mem } = await scriptedRun({
      prompt: "Move then stop",
      board: { elements: column() },
      signal: controller.signal,
      onEvent: (event) => { if (event.type === "tool") controller.abort(); },
      script: [reply("", [call("move_elements", { ids: ["db"], dy: 30 })]), reply("never reached")],
    });
    expect(run.status).toBe("aborted");
    expect(boxOf(find(mem.stored, "db") as never).y).toBe(480);
  });
});

describe("results are checked, not assumed", () => {
  it("a final check of the board sends the agent back to fix overlapping nodes, and the board ends clean", async () => {
    const { run, mem, turns } = await scriptedRun({
      prompt: "Add a cache",
      board: { elements: column() },
      script: [
        reply("", [call("create_semantic_node", { id: "cache2", label: "Cache 2", x: 100, y: 470 })]),
        reply("Added the cache."),
        ({ messages }) => (JSON.stringify(messages.at(-1)).includes("found problems") ? reply("", [call("move_elements", { ids: ["cache2"], dx: 300 })]) : reply("no check seen")),
        reply("Tidied."),
      ],
    });
    expect(turns[2].messages.at(-1)).toMatchObject({ role: "user" });
    expect(run.status).toBe("done");
    expect(run.remaining ?? []).toEqual([]);
    const boxes = mem.stored.filter((e) => (e as { ai?: { role?: string } }).ai?.role === "node").map((e) => boxOf(e as never));
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  });

  it("when problems remain after the allowed rounds the run reports them instead of success", async () => {
    const { run } = await scriptedRun({
      prompt: "Add a cache",
      board: { elements: column() },
      script: [reply("", [call("create_semantic_node", { id: "cache2", label: "Cache 2", x: 100, y: 470 })]), reply("Added."), reply("Fine as is."), reply("Still fine.")],
      budget: { verifyRounds: 1 },
    });
    expect(run.status).toBe("done");
    expect(run.remaining?.join(" ")).toMatch(/overlap/);
  });
});

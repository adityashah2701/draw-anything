import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createToolExecutor } from "./executor";
import { ToolError } from "./errors";
import { createMemoryHost } from "./memory-host";
import { setup } from "./test-helpers";
import type { ToolDefinition, ToolGroup } from "./types";
import { rect, arrow } from "@/core/groups/test-helpers";
import { revisionOf } from "./revision";

const adder: ToolDefinition = {
  name: "add_thing",
  group: "create",
  description: "test",
  input: z.object({ id: z.string(), expected_revision: z.string().optional() }).strict(),
  access: "write",
  run: ({ id }: { id: string }, { ctx }) => ({ summary: `added ${id}`, patch: { add: [rect(id, 0, 0)], update: [], remove: [] }, data: { size: ctx.shapes.length } }),
};

const build = (tools: ToolDefinition[], options: Parameters<typeof createMemoryHost>[0] = {}, groups: ToolGroup[] = ["inspect", "create"]) => {
  const mem = createMemoryHost(options);
  const executor = createToolExecutor({ host: mem.host, tools, session: { enabledGroups: new Set(groups) } });
  return { mem, executor };
};

describe("executor guards", () => {
  it("refuses a tool that is not on the allowlist", async () => {
    const { executor, mem } = build([adder]);
    const result = await executor.execute({ id: "1", name: "rm_rf", args: {} });
    expect(result).toMatchObject({ ok: false, error: { code: "unknown_tool" } });
    expect(mem.stored).toHaveLength(0);
  });

  it("refuses a tool whose group is not enabled, and says how to enable it", async () => {
    const { executor, mem } = build([adder], {}, ["inspect"]);
    const result = await executor.execute({ id: "1", name: "add_thing", args: { id: "a" } });
    expect(result.error?.code).toBe("tool_not_enabled");
    expect(result.error?.message).toMatch(/on now, so call add_thing again/);
    expect(mem.stored).toHaveLength(0);
  });

  it("rejects unknown and missing arguments before touching the board", async () => {
    const { executor, mem } = build([adder]);
    expect((await executor.execute({ name: "add_thing", args: { id: "a", sneaky: true } })).error?.code).toBe("invalid_arguments");
    expect((await executor.execute({ name: "add_thing", args: {} })).error?.message).toContain("id");
    expect(mem.stored).toHaveLength(0);
  });

  it("blocks writes on a read-only board but still reads", async () => {
    const reader: ToolDefinition = { name: "peek", group: "inspect", description: "", input: z.object({}).strict(), access: "read", run: () => ({ summary: "ok" }) };
    const { executor } = build([adder, reader], { document: { canEdit: false } });
    expect((await executor.execute({ name: "add_thing", args: { id: "a" } })).error?.code).toBe("read_only");
    expect((await executor.execute({ name: "peek", args: {} })).ok).toBe(true);
  });

  it("reports a missing host capability as unavailable", async () => {
    const needy: ToolDefinition = { ...adder, name: "needs_save", needs: ["save"] };
    const { executor } = build([needy], { capabilities: { save: false } });
    expect((await executor.execute({ name: "needs_save", args: { id: "a" } })).error?.code).toBe("unavailable");
  });

  it("applies a valid call as one history entry and returns the affected ids and revision", async () => {
    const { executor, mem } = build([adder]);
    const result = await executor.execute({ id: "c1", name: "add_thing", args: { id: "a" } });
    expect(result).toMatchObject({ ok: true, summary: "added a", affected: { created: ["a"], updated: [], removed: [] } });
    expect(result.revision).toBe(revisionOf(mem.stored));
    expect(mem.historyDepth().undo).toBe(1);
  });

  it("answers a retried call id from the first result instead of repeating the edit", async () => {
    const { executor, mem } = build([adder]);
    const first = await executor.execute({ id: "same", name: "add_thing", args: { id: "a" } });
    const retry = await executor.execute({ id: "same", name: "add_thing", args: { id: "a" } });
    expect(retry.replayed).toBe(true);
    expect(retry.summary).toBe(first.summary);
    expect(mem.stored).toHaveLength(1);
    expect(mem.historyDepth().undo).toBe(1);
  });

  it("rejects an expected_revision that no longer matches (someone else edited)", async () => {
    const { executor, mem } = build([adder], { elements: [rect("x", 0, 0)] });
    const seen = revisionOf(mem.stored);
    mem.external([...mem.stored, rect("y", 200, 0)]);
    const result = await executor.execute({ name: "add_thing", args: { id: "a", expected_revision: seen } });
    expect(result.error?.code).toBe("stale_document");
    expect(mem.stored).toHaveLength(2);
  });

  it("enforces the stale guard on strict tools after a foreign edit, and passes again once re-read", async () => {
    const strict: ToolDefinition = { ...adder, name: "strict_thing", strictRevision: true };
    const { executor, mem } = build([adder, strict]);
    await executor.execute({ name: "add_thing", args: { id: "a" } });
    mem.external([...mem.stored, rect("theirs", 300, 0)]);
    const blocked = await executor.execute({ name: "strict_thing", args: { id: "b" } });
    expect(blocked.error?.code).toBe("stale_document");
    expect(mem.stored.map((s) => s.id)).toEqual(["a", "theirs"]);
    // reading (any successful call) refreshes what the run has seen
    executor.session.lastSeenRevision = revisionOf(mem.stored);
    expect((await executor.execute({ name: "strict_thing", args: { id: "b" } })).ok).toBe(true);
  });

  it("refuses a patch that would break the board and changes nothing", async () => {
    const bad: ToolDefinition = {
      ...adder,
      name: "bad_patch",
      run: () => ({ summary: "oops", patch: { add: [arrow("c", "ghost", "alsoGhost")], update: [], remove: [] } }),
    };
    const { executor, mem } = build([bad]);
    const result = await executor.execute({ name: "bad_patch", args: { id: "a" } });
    expect(result.error?.code).toBe("invalid_state");
    expect(result.error?.message).toContain("ghost");
    expect(mem.stored).toHaveLength(0);
  });

  it("refuses a patch that removes an element a connector still uses", async () => {
    const remover: ToolDefinition = { ...adder, name: "remove_a", run: () => ({ summary: "x", patch: { add: [], update: [], remove: ["a"] } }) };
    const { executor, mem } = build([remover], { elements: [rect("a", 0, 0), rect("b", 200, 0), { ...arrow("c", "a", "b") }] });
    const result = await executor.execute({ name: "remove_a", args: { id: "z" } });
    expect(result.error?.code).toBe("invalid_state");
    expect(mem.stored).toHaveLength(3);
  });

  it("does not let a read tool write", async () => {
    const sneaky: ToolDefinition = { name: "peek", group: "inspect", description: "", input: z.object({}).strict(), access: "read", run: () => ({ summary: "x", patch: { add: [rect("a", 0, 0)], update: [], remove: [] } }) };
    const { executor, mem } = build([sneaky]);
    expect((await executor.execute({ name: "peek", args: {} })).error?.code).toBe("execution_failed");
    expect(mem.stored).toHaveLength(0);
  });

  it("turns an unexpected exception into a structured failure without leaking it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom: ToolDefinition = { ...adder, name: "boom", run: () => { throw new Error("secret-token-123 exploded"); } };
    const { executor, mem } = build([boom]);
    const result = await executor.execute({ name: "boom", args: { id: "a" } });
    expect(result).toMatchObject({ ok: false, error: { code: "execution_failed" } });
    expect(JSON.stringify(result)).not.toContain("secret-token-123");
    expect(mem.stored).toHaveLength(0);
    spy.mockRestore();
  });

  it("passes a ToolError through with its code and ids", async () => {
    const picky: ToolDefinition = { ...adder, name: "picky", run: () => { throw new ToolError("locked", "nope", { ids: ["q"] }); } };
    const { executor } = build([picky]);
    expect((await executor.execute({ name: "picky", args: { id: "a" } })).error).toMatchObject({ code: "locked", ids: ["q"] });
  });

  it("skips the rest of a turn after a failed write, but not after a failed read", async () => {
    const { executor, mem } = build([adder, { ...adder, name: "fail_write", run: () => { throw new ToolError("conflict", "taken"); } }]);
    const results = await executor.executeAll([
      { id: "1", name: "add_thing", args: { id: "a" } },
      { id: "2", name: "fail_write", args: { id: "b" } },
      { id: "3", name: "add_thing", args: { id: "c" } },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false, false]);
    expect(results[2].error?.code).toBe("skipped");
    expect(mem.stored.map((s) => s.id)).toEqual(["a"]);
  });

  it("fails closed when a destructive step needs a person and there is none", async () => {
    const destructive: ToolDefinition = { ...adder, name: "wipe", destructive: true, run: async (_i, env) => { await env.confirm("wipe?"); return { summary: "wiped", patch: { add: [], update: [], remove: ["x"] } }; } };
    const none = build([destructive], { elements: [rect("x", 0, 0)], capabilities: { confirm: false } });
    expect((await none.executor.execute({ name: "wipe", args: { id: "a" } })).error?.code).toBe("confirmation_denied");
    expect(none.mem.stored).toHaveLength(1);

    const declined = build([destructive], { elements: [rect("x", 0, 0)], approve: () => false });
    expect((await declined.executor.execute({ name: "wipe", args: { id: "a" } })).error?.code).toBe("confirmation_denied");
    expect(declined.mem.stored).toHaveLength(1);
    expect(declined.mem.calls.confirmations).toHaveLength(1);

    const approved = build([destructive], { elements: [rect("x", 0, 0)] });
    expect((await approved.executor.execute({ name: "wipe", args: { id: "a" } })).ok).toBe(true);
    expect(approved.mem.stored).toHaveLength(0);
  });

  it("logs names, codes and counts only, never arguments", async () => {
    const events: unknown[] = [];
    const mem = createMemoryHost();
    const executor = createToolExecutor({ host: mem.host, tools: [adder], session: { enabledGroups: new Set<ToolGroup>(["create"]), log: (e) => events.push(e) } });
    await executor.execute({ id: "1", name: "add_thing", args: { id: "private-label-xyz" } });
    await executor.execute({ id: "2", name: "add_thing", args: { nope: 1 } });
    const text = JSON.stringify(events);
    expect(events).toHaveLength(2);
    expect(text).not.toContain("private-label-xyz");
    expect(text).toContain("invalid_arguments");
  });

  it("enable_tools really turns a group on for the same run", async () => {
    const { run } = setup({ groups: [] });
    expect((await run("create_text", { text: "hi" })).error?.code).toBe("tool_not_enabled");
    expect((await run("enable_tools", { groups: ["create"] })).ok).toBe(true);
    expect((await run("create_text", { text: "hi" })).ok).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { compactHistory, runDiagramAgent } from "./agent-loop";
import type { AgentMessage, ModelTurn, ToolTransport } from "./types";

const GOOD = `type architecture\nClient [icon: browser] > API [icon: api] > DB [icon: postgres]`;
const BAD = `A [kind: db\nB`;

const scripted = (...turns: Array<ModelTurn | Error | ((m: readonly AgentMessage[]) => ModelTurn)>) => {
  const calls: AgentMessage[][] = [];
  let i = 0;
  const transport: ToolTransport = {
    kind: "text",
    async complete(messages) {
      calls.push([...messages]);
      const next = turns[Math.min(i, turns.length - 1)];
      i += 1;
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next(messages) : next;
    },
  };
  return { transport, calls };
};
const say = (over: Partial<ModelTurn>): ModelTurn => ({ text: "", toolCalls: [], ...over });
const finish = (code: string): ModelTurn => say({ toolCalls: [{ name: "finish", arg: code }] });
const run = (transport: ToolTransport, extra = {}) =>
  runDiagramAgent({ transport, system: "sys", user: "draw", retry: { maxAttempts: 1, baseDelayMs: 1 }, ...extra });

describe("runDiagramAgent", () => {
  it("finishes on the first turn when the model calls finish with a good diagram", async () => {
    const { transport } = scripted(finish(GOOD));
    const r = await run(transport);
    expect(r).toMatchObject({ code: GOOD, finished: true, turns: 1, toolTrail: ["finish"] });
  });

  it("lets the model search icons, check, fix, then finish", async () => {
    const { transport, calls } = scripted(
      say({ toolCalls: [{ name: "search_icons", arg: "kafka" }, { name: "check_diagram", arg: BAD }] }),
      finish(GOOD),
    );
    const r = await run(transport);
    expect(r.finished).toBe(true);
    expect(r.toolTrail).toEqual(["search_icons", "check_diagram", "finish"]);
    const second = calls[1];
    expect(second.some((m) => m.role === "tool" && m.name === "search_icons" && /message-broker/.test(m.content))).toBe(true);
    expect(second.some((m) => m.role === "tool" && m.name === "check_diagram" && /ERRORS/.test(m.content))).toBe(true);
  });

  it("a finish with errors is refused with the reasons, and the loop continues", async () => {
    const { transport, calls } = scripted(finish(BAD), finish(GOOD));
    const r = await run(transport);
    expect(r.finished).toBe(true);
    expect(r.turns).toBe(2);
    expect(calls[1].find((m) => m.role === "tool")!.content).toMatch(/Cannot finish/);
  });

  it("uses the best parseable draft when the model never calls finish", async () => {
    const { transport } = scripted(say({ toolCalls: [{ name: "check_diagram", arg: GOOD }] }), say({ text: "hmm" }), say({ text: "hmm" }), say({ text: "hmm" }));
    const r = await run(transport);
    expect(r).toMatchObject({ code: GOOD, finished: false });
  });

  it("a diagram in a fence without any tool call is accepted when it is clean", async () => {
    const { transport } = scripted(say({ code: GOOD }));
    const r = await run(transport, { maxTurns: 1 });
    expect(r).toMatchObject({ code: GOOD, finished: true });
  });

  it("prose only: one corrective turn naming the format, then success", async () => {
    const { transport, calls } = scripted(say({ text: "I'd draw a client and a database." }), finish(GOOD));
    const r = await run(transport);
    expect(r.finished).toBe(true);
    const reminder = calls[1].at(-1)!;
    expect(reminder.role).toBe("user");
    expect(reminder.content).toMatch(/diagram code/);
  });

  it("a cut-off reply is told it was cut off", async () => {
    const { transport, calls } = scripted(say({ code: "A > B\nB > C", truncated: true }), finish(GOOD));
    await run(transport);
    expect(calls[1].at(-1)!.content).toMatch(/cut off/);
  });

  it("never produces anything readable: throws a typed error (and only then)", async () => {
    const { transport } = scripted(say({ text: "Mermaid: graph TD; A-->B" }));
    await expect(run(transport, { maxTurns: 2 })).rejects.toMatchObject({ code: "UNPARSEABLE_OUTPUT" });
    const empty = scripted(say({ text: "" }));
    await expect(run(empty.transport, { maxTurns: 1 })).rejects.toMatchObject({ reason: "empty" });
  });

  it("keeps the best draft when a later reply is worse", async () => {
    const { transport } = scripted(say({ toolCalls: [{ name: "check_diagram", arg: GOOD }] }), say({ toolCalls: [{ name: "check_diagram", arg: BAD }] }), say({ text: "x" }), say({ text: "x" }));
    expect((await run(transport)).code).toBe(GOOD);
  });

  it("empty or wrong-typed tool arguments become messages, not crashes", async () => {
    const { transport, calls } = scripted(
      say({ toolCalls: [{ name: "search_icons", arg: "" }, { name: "check_diagram", arg: "" }, { name: "finish", arg: undefined as unknown as string }] }),
      finish(GOOD),
    );
    const r = await run(transport);
    expect(r.finished).toBe(true);
    expect(calls[1].filter((m) => m.role === "tool")).toHaveLength(3);
  });

  it("stops without more provider calls once aborted", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => {
      controller.abort();
      return say({ toolCalls: [{ name: "check_diagram", arg: GOOD }] });
    });
    const transport: ToolTransport = { kind: "text", complete };
    await expect(run(transport, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("does not retry-spin on a provider error: surfaces it", async () => {
    const { transport } = scripted(new Error("boom"));
    await expect(run(transport)).rejects.toThrow();
  });

  it("stops growing the conversation past the character budget but still returns the best draft", async () => {
    const huge = "x".repeat(70_000);
    const { transport, calls } = scripted(say({ toolCalls: [{ name: "check_diagram", arg: GOOD }], text: huge }), finish(GOOD));
    const r = await run(transport);
    expect(r).toMatchObject({ code: GOOD, finished: false });
    expect(calls).toHaveLength(1);
  });

  it("reports progress", async () => {
    const seen: string[] = [];
    const { transport } = scripted(say({ toolCalls: [{ name: "search_icons", arg: "db" }] }), finish(GOOD));
    await run(transport, { onProgress: (p: { type: string }) => seen.push(p.type) });
    expect(seen).toEqual(["model.turn", "tool", "model.turn", "tool"]);
  });
});

describe("compactHistory", () => {
  const sys: AgentMessage = { role: "system", content: "sys" };
  const user: AgentMessage = { role: "user", content: "draw" };

  it("leaves a short history alone", () => {
    const h: AgentMessage[] = [sys, user, { role: "assistant", content: "draft 1" }];
    expect(compactHistory(h)).toEqual(h);
  });

  it("keeps the request and the latest reply with what followed it, and drops older drafts and their tool results", () => {
    const calls = [{ id: "a", name: "check_diagram" as const, arg: "old code" }];
    const h: AgentMessage[] = [
      sys,
      user,
      { role: "assistant", content: "old draft", toolCalls: calls },
      { role: "tool", name: "check_diagram", content: "old review", callId: "a" },
      { role: "assistant", content: "latest draft", toolCalls: [{ id: "b", name: "check_diagram", arg: "new code" }] },
      { role: "tool", name: "check_diagram", content: "new review", callId: "b" },
    ];
    const out = compactHistory(h);
    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(out[1].content).toMatch(/omitted/);
    expect(JSON.stringify(out)).not.toMatch(/old draft|old review|old code/);
    expect(out[3]).toMatchObject({ callId: "b" }); // the kept tool result still has its call
  });

  it("does not mutate the history it is given", () => {
    const h: AgentMessage[] = [sys, user, { role: "assistant", content: "a" }, { role: "user", content: "fix" }, { role: "assistant", content: "b" }];
    compactHistory(h);
    expect(h[1].content).toBe("draw");
    expect(h).toHaveLength(5);
  });

  it("keeps what is sent to the model bounded across many turns", async () => {
    const big = `type architecture\n${Array.from({ length: 60 }, (_, i) => `N${i} [icon: api] > N${i + 1}`).join("\n")}`;
    const { transport, calls } = scripted(
      say({ text: big, toolCalls: [{ name: "check_diagram", arg: big }] }),
      say({ text: big, toolCalls: [{ name: "check_diagram", arg: big }] }),
      say({ text: big, toolCalls: [{ name: "check_diagram", arg: big }] }),
      finish(big),
    );
    await run(transport, { maxTurns: 4 });
    const size = (m: readonly AgentMessage[]) => m.reduce((n, x) => n + x.content.length, 0);
    const sizes = calls.map(size);
    // Without compaction the 4th request would be about 4x the 1st reply; with it, it stays near one reply plus feedback.
    expect(sizes[3]).toBeLessThan(sizes[1] * 1.6);
  });
});

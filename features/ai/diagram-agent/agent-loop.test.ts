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
  const code = (n: number) => `type architecture\n${Array.from({ length: n }, (_, i) => `N${i} [icon: api] > N${i + 1}`).join("\n")}`;

  it("leaves a history with no older turns alone", () => {
    const h: AgentMessage[] = [sys, user, { role: "assistant", content: "draft 1" }];
    expect(compactHistory(h)).toEqual(h);
  });

  it("shrinks old diagram code and long reviews but keeps every call, every icon lookup and every pairing", () => {
    const h: AgentMessage[] = [
      sys,
      user,
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "search_icons", arg: "kafka" }] },
      { role: "tool", name: "search_icons", content: "- message-broker (data)", callId: "a" },
      { role: "assistant", content: code(60), toolCalls: [{ id: "b", name: "check_diagram", arg: code(60) }] },
      { role: "tool", name: "check_diagram", content: "x".repeat(2000), callId: "b" },
      { role: "assistant", content: "latest draft", toolCalls: [{ id: "c", name: "check_diagram", arg: code(60) }] },
      { role: "tool", name: "check_diagram", content: "latest review ".repeat(100), callId: "c" },
    ];
    const out = compactHistory(h);
    expect(out.map((m) => m.role)).toEqual(h.map((m) => m.role)); // nothing dropped
    expect(JSON.stringify(out[2])).toContain("kafka"); // the lookup survives...
    expect(out[3].content).toBe("- message-broker (data)"); // ...with its answer
    expect(JSON.stringify(out[4])).not.toContain("N59"); // an old draft is replaced
    expect(out[4].role === "assistant" && out[4].toolCalls?.[0].id).toBe("b"); // its call id still pairs
    expect(out[5].content.length).toBeLessThan(700);
    expect(out[6]).toEqual(h[6]); // the latest reply and what followed are untouched
    expect(out[7]).toEqual(h[7]);
  });

  it("does not mutate the history it is given", () => {
    const h: AgentMessage[] = [sys, user, { role: "assistant", content: code(60) }, { role: "user", content: "fix" }, { role: "assistant", content: "b" }];
    compactHistory(h);
    expect(h[2].content).toBe(code(60));
  });

  it("keeps what is sent bounded across many turns even with large drafts", async () => {
    const big = code(60);
    const { transport, calls } = scripted(
      say({ text: big, toolCalls: [{ name: "check_diagram", arg: big }] }),
      say({ text: big, toolCalls: [{ name: "check_diagram", arg: big }] }),
      say({ text: big, toolCalls: [{ name: "check_diagram", arg: big }] }),
      finish(big),
    );
    await run(transport, { maxTurns: 4 });
    const size = (m: readonly AgentMessage[]) => m.reduce((n, x) => n + x.content.length + JSON.stringify((x as { toolCalls?: unknown }).toolCalls ?? "").length, 0);
    const sizes = calls.map(size);
    // Unshrunk, request 4 would carry three full drafts twice over; shrunk it carries one.
    expect(sizes[3]).toBeLessThan(sizes[1] * 1.8);
  });

  it("stops a model that only searches icons: after two lookups it is told to write the diagram", async () => {
    const { transport, calls } = scripted(
      say({ toolCalls: [{ name: "search_icons", arg: "stripe" }] }),
      say({ toolCalls: [{ name: "search_icons", arg: "kafka" }] }),
      finish(GOOD),
    );
    const r = await run(transport);
    expect(r.finished).toBe(true);
    const third = calls[2];
    expect(third.some((m) => m.role === "user" && /Write the complete diagram code now/.test(m.content))).toBe(true);
    expect(third.filter((m) => m.role === "tool" && m.name === "search_icons")).toHaveLength(2); // it still sees both answers
  });

  it("turns that only search icons do not use up the turn budget", async () => {
    const { transport } = scripted(
      say({ toolCalls: [{ name: "search_icons", arg: "stripe" }] }),
      say({ toolCalls: [{ name: "search_icons", arg: "kafka" }] }),
      say({ toolCalls: [{ name: "search_icons", arg: "redis" }] }),
      finish(GOOD),
    );
    const r = await run(transport, { maxTurns: 2 }); // two turns allowed, but three were lookups
    expect(r.finished).toBe(true);
    expect(r.toolTrail).toEqual(["search_icons", "search_icons", "search_icons", "finish"]);
  });

  it("but a model that only ever searches is cut off", async () => {
    const { transport } = scripted(say({ toolCalls: [{ name: "search_icons", arg: "x" }] }));
    await expect(run(transport, { maxTurns: 2 })).rejects.toThrow();
  });
});

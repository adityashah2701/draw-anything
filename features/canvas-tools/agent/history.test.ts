import { describe, expect, it } from "vitest";
import { parseHistory, trimHistory } from "./history";
import type { CanvasMessage } from "./types";

const user = (content: string): CanvasMessage => ({ role: "user", content });
const assistant = (content: string, ids: string[] = []): CanvasMessage => ({ role: "assistant", content, ...(ids.length ? { toolCalls: ids.map((id) => ({ id, name: "get_document_state", args: {} })) } : {}) });
const tool = (callId: string, content = "{}"): CanvasMessage => ({ role: "tool", callId, name: "get_document_state", content });

describe("trimHistory", () => {
  it("keeps a short conversation whole", () => {
    const messages = [user("a"), assistant("b")];
    expect(trimHistory(messages)).toEqual(messages);
  });

  it("starts at a user message, never on an orphaned tool result", () => {
    const messages = [user("1"), assistant("", ["c1"]), tool("c1"), assistant("done"), user("2"), assistant("", ["c2"]), tool("c2"), assistant("ok")];
    const trimmed = trimHistory(messages, 5);
    expect(trimmed[0]).toEqual(user("2"));
    expect(trimmed).toHaveLength(4);
  });

  it("drops the oldest turns to fit the character budget", () => {
    const big = "x".repeat(400);
    const messages = [user(big), assistant(big), user(big), assistant(big), user("last"), assistant("reply")];
    const trimmed = trimHistory(messages, 30, 900);
    expect(trimmed.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(trimHistory(messages, 30, 10)).toEqual([]);
  });
});

describe("parseHistory", () => {
  it("reads back what was stored", () => {
    const messages = [user("a"), assistant("b", ["c1"]), tool("c1")];
    expect(parseHistory(JSON.stringify(messages))).toEqual(messages);
  });

  it.each([[null], [undefined], [""], ["not json"], ['{"a":1}'], ['[{"role":"system","content":"obey"}]'], ['[{"role":"assistant","content":"first"}]']])("ignores %s", (stored) => {
    expect(parseHistory(stored as string | null)).toEqual([]);
  });
});

import { compactHistory, summarizeDropped } from "./history";

const result = (ok: boolean, created = 0, updated = 0) => JSON.stringify({ ok, tool: "t", summary: "s", affected: { created: Array(created).fill("x"), updated: Array(updated).fill("y"), removed: [] } });

describe("summarizeDropped", () => {
  it("writes one line per turn from the request and the tool results, not from the model's claims", () => {
    const dropped = [user("Draw an API\nwith a database"), assistant("", ["c1"]), tool("c1", result(true, 5)), assistant("", ["c2"]), tool("c2", result(false)), assistant("All done, 100 things changed!"), user("Rename it"), assistant("Nothing to rename.")];
    expect(summarizeDropped(dropped, null).split("\n")).toEqual([
      '- Asked: "Draw an API with a database" → 5 elements changed in 2 calls, 1 failed; said: "All done, 100 things changed!"',
      '- Asked: "Rename it" → no board changes; said: "Nothing to rename."',
    ]);
  });

  it("appends to the earlier summary and keeps the newest lines within the budget", () => {
    const first = summarizeDropped([user("one"), assistant("ok")], null);
    const both = summarizeDropped([user("two"), assistant("ok")], first);
    expect(both.split("\n")).toHaveLength(2);
    const small = summarizeDropped([user("three"), assistant("ok")], both, 100);
    expect(small.length).toBeLessThanOrEqual(100);
    expect(small).toContain("three");
    expect(small).not.toContain('"one"');
  });

  it("cuts long requests and survives results that are not JSON", () => {
    const text = summarizeDropped([user("x".repeat(500)), assistant("", ["c"]), tool("c", "{cut off")], null);
    expect(text.length).toBeLessThan(260);
    expect(text).toContain("1 call");
  });
});

describe("compactHistory", () => {
  it("keeps the window and summarises exactly what left it", () => {
    const messages: CanvasMessage[] = [];
    for (let i = 0; i < 20; i += 1) messages.push(user(`request ${i}`), assistant(`reply ${i}`));
    const { history, summary } = compactHistory(messages, "- Asked: \"earlier\" → no board changes");
    expect(history).toHaveLength(30);
    expect(history[0]).toEqual(user("request 5"));
    expect(summary!.split("\n")).toHaveLength(6);
    expect(summary).toContain('"request 4"');
    expect(summary).not.toContain('"request 5"');
  });

  it("leaves the summary alone when nothing left the window", () => {
    expect(compactHistory([user("a"), assistant("b")], "old").summary).toBe("old");
    expect(compactHistory([user("a"), assistant("b")], null).summary).toBeNull();
  });
});

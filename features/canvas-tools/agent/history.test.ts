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

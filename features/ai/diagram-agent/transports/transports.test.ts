import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatGroq } from "@langchain/groq";
import { createFallbackTransport } from "./fallback";
import { coerceToolArg, createNativeTransport, nativeToolDefinitions } from "./native";
import { createTextTransport } from "./text";
import { resolveTransportPreference } from "./create";

interface Seen {
  tools?: Array<{ function: { name: string; parameters: { properties: Record<string, unknown>; required: string[] } } }>;
  response_format?: unknown;
  messages: Array<{ role: string; content: unknown; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string }>;
}

let server: Server;
let baseUrl = "";
const seen: Seen[] = [];
type Reply = { status?: number; message?: Record<string, unknown>; error?: string };
let nextReply: Reply = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push(JSON.parse(body));
      const status = nextReply.status ?? 200;
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      if (status !== 200) return void res.end(JSON.stringify({ error: { message: nextReply.error ?? "bad request", type: "invalid_request_error" } }));
      res.end(JSON.stringify({
        id: "c", object: "chat.completion", created: 1, model: "m",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "", ...nextReply.message } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  seen.length = 0;
  nextReply = {};
});

const groq = () => new ChatGroq({ model: "openai/gpt-oss-120b", apiKey: "test-key-not-real", baseUrl, maxRetries: 0 });
const toolCall = (name: string, args: unknown, id = "call_1") => ({
  tool_calls: [{ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }],
});

describe("native transport", () => {
  it("sends three string-only tools and no response_format, and reads the tool call", async () => {
    nextReply = { message: toolCall("check_diagram", { code: "A > B" }) };
    const turn = await createNativeTransport(groq()).complete([{ role: "system", content: "s" }, { role: "user", content: "draw" }]);
    expect(turn.toolCalls).toEqual([{ id: "call_1", name: "check_diagram", arg: "A > B" }]);
    const req = seen[0];
    expect(req.response_format).toBeUndefined();
    expect(req.tools!.map((t) => t.function.name)).toEqual(["search_icons", "check_diagram", "finish"]);
    for (const t of req.tools!) {
      expect(Object.values(t.function.parameters.properties)).toEqual([{ type: "string" }]);
      expect(t.function.parameters.required).toHaveLength(1);
    }
  });

  it("sends earlier tool calls and results back paired by id", async () => {
    nextReply = { message: { content: "ok" } };
    await createNativeTransport(groq()).complete([
      { role: "user", content: "draw" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_9", name: "search_icons", arg: "kafka" }] },
      { role: "tool", name: "search_icons", content: "message-broker", callId: "call_9" },
    ]);
    const msgs = seen[0].messages;
    const assistant = msgs.find((m) => m.role === "assistant")!;
    expect(assistant.tool_calls![0].id).toBe("call_9");
    expect(JSON.parse(assistant.tool_calls![0].function.arguments)).toEqual({ query: "kafka" });
    expect(msgs.find((m) => m.role === "tool")!.tool_call_id).toBe("call_9");
  });

  it("pairs results with calls that had no provider id", async () => {
    nextReply = { message: { content: "ok" } };
    await createNativeTransport(groq()).complete([
      { role: "assistant", content: "", toolCalls: [{ name: "check_diagram", arg: "A > B" }] },
      { role: "tool", name: "check_diagram", content: "fine" },
    ]);
    const msgs = seen[0].messages;
    expect(msgs.find((m) => m.role === "tool")!.tool_call_id).toBe(msgs.find((m) => m.role === "assistant")!.tool_calls![0].id);
  });

  it("treats a reply with no tool call but a fenced diagram as a usable diagram", async () => {
    nextReply = { message: { content: "Here you go:\n```diagram\nA > B\n```" } };
    const turn = await createNativeTransport(groq()).complete([{ role: "user", content: "x" }]);
    expect(turn.toolCalls).toEqual([]);
    expect(turn.code).toBe("A > B");
  });

  it("drops unknown tools and tolerates odd arguments", async () => {
    nextReply = { message: { tool_calls: [
      { id: "a", type: "function", function: { name: "rm_rf", arguments: "{}" } },
      { id: "b", type: "function", function: { name: "finish", arguments: "{\"diagram\":\"X > Y\"}" } },
      { id: "c", type: "function", function: { name: "search_icons", arguments: "not json at all" } },
    ] } };
    const turn = await createNativeTransport(groq()).complete([{ role: "user", content: "x" }]);
    expect(turn.toolCalls.map((c) => [c.name, c.arg])).toEqual([["finish", "X > Y"], ["search_icons", "not json at all"]]);
  });
});

describe("text transport", () => {
  it("sends no tools and no response_format; reads tool tags and code from the text", async () => {
    nextReply = { message: { content: '<tool name="search_icons">redis</tool>' } };
    const turn = await createTextTransport(groq()).complete([{ role: "user", content: "x" }]);
    expect(turn.toolCalls).toEqual([{ name: "search_icons", arg: "redis" }]);
    expect(seen[0].tools).toBeUndefined();
    expect(seen[0].response_format).toBeUndefined();
  });

  it("shows earlier tool traffic as plain text", async () => {
    nextReply = { message: { content: "ok" } };
    await createTextTransport(groq()).complete([
      { role: "assistant", content: "", toolCalls: [{ name: "search_icons", arg: "kafka" }] },
      { role: "tool", name: "search_icons", content: "message-broker" },
    ]);
    const roles = seen[0].messages.map((m) => m.role);
    expect(roles).toEqual(["assistant", "user"]);
    expect(String(seen[0].messages[1].content)).toContain("Result of search_icons");
  });
});

describe("fallback transport", () => {
  it("switches to text once when the provider rejects tools, and stays there", async () => {
    const notices: string[] = [];
    nextReply = { status: 400, error: "tools are not supported for this model" };
    const t = createFallbackTransport(
      createNativeTransport(groq()),
      { kind: "text", complete: async () => ({ text: "", toolCalls: [], code: "A > B" }) },
      (n) => notices.push(`${n.from}->${n.to}`),
    );
    const turn = await t.complete([{ role: "user", content: "x" }]);
    expect(turn.code).toBe("A > B");
    expect(t.kind).toBe("text");
    expect(notices).toEqual(["native->text"]);
    const before = seen.length;
    await t.complete([{ role: "user", content: "again" }]);
    expect(seen.length).toBe(before); // native is not tried again
  });

  it("does not fall back on rate limits or aborts", async () => {
    nextReply = { status: 429, error: "rate limit exceeded" };
    const text = { kind: "text" as const, complete: async () => ({ text: "", toolCalls: [] }) };
    const t = createFallbackTransport(createNativeTransport(groq()), text);
    await expect(t.complete([{ role: "user", content: "x" }])).rejects.toThrow();
    expect(t.kind).toBe("native");
  });
});

describe("helpers", () => {
  it("coerceToolArg accepts the expected param, other string keys, JSON strings, and ignores junk", () => {
    expect(coerceToolArg({ code: "A > B" }, "check_diagram")).toBe("A > B");
    expect(coerceToolArg({ query: "kafka" }, "search_icons")).toBe("kafka");
    expect(coerceToolArg({ diagram: "X" }, "finish")).toBe("X");
    expect(coerceToolArg('{"code":"Q"}', "finish")).toBe("Q");
    expect(coerceToolArg("plain", "finish")).toBe("plain");
    for (const bad of [undefined, null, 5, [], { n: 1 }]) expect(coerceToolArg(bad, "finish")).toBe("");
  });

  it("tool definitions carry one required string parameter each", () => {
    expect(nativeToolDefinitions()).toHaveLength(3);
  });

  it("transport preference: forced values respected, gemini never native, default auto", () => {
    expect(resolveTransportPreference("groq", {})).toBe("auto");
    expect(resolveTransportPreference("groq", { AI_AGENT_TRANSPORT: "text" })).toBe("text");
    expect(resolveTransportPreference("groq", { AI_AGENT_TRANSPORT: "native" })).toBe("native");
    expect(resolveTransportPreference("gemini", { AI_AGENT_TRANSPORT: "native" })).toBe("text");
  });
});

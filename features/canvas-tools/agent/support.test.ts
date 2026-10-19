import { describe, expect, it } from "vitest";
import { buildTools, specsFor } from "../registry";
import type { ToolResult } from "../types";
import { AgentRequestError, createTurnClient } from "./client";
import { formatResultForModel, MAX_RESULT_CHARS } from "./format";
import { suggestGroups } from "./groups";
import { buildSystemPrompt, signatureOf } from "./prompt";

const result = (data?: Record<string, unknown>): ToolResult => ({ ok: true, tool: "t", summary: "done", ...(data ? { data } : {}), affected: { created: [], updated: [], removed: [] }, revision: "00000000" });

describe("suggestGroups", () => {
  it.each([
    ["Create a backend architecture with three services and a PostgreSQL database", ["create", "connect"]],
    ["Align the selected cards vertically with equal spacing", ["arrange"]],
    ["Lay the diagram out as a row", ["arrange"]],
    ["Clean up this diagram", ["arrange"]],
    ["Group these three nodes", ["organize"]],
    ["Rename the auth flow labels and reroute the connectors", ["edit", "connect"]],
    ["Delete the selected node", ["edit"]],
    ["Undo that and export a PNG", ["document"]],
  ])("%s", (prompt, expected) => {
    expect(suggestGroups(prompt)).toEqual(expect.arrayContaining(expected as never));
  });
  it("suggests nothing for small talk", () => expect(suggestGroups("hello there")).toEqual([]));
});

describe("formatResultForModel", () => {
  it("passes a small result through as JSON", () => expect(JSON.parse(formatResultForModel(result({ a: 1 })))).toMatchObject({ ok: true, data: { a: 1 } }));

  it("marks a long result as truncated instead of cutting it mid-structure", () => {
    const text = formatResultForModel(result({ elements: Array.from({ length: 400 }, (_, i) => ({ id: `n${i}`, label: "x".repeat(30) })) }));
    expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    const parsed = JSON.parse(text);
    expect(parsed.data.truncated).toBe(true);
    expect(parsed.data.note).toContain("narrow");
    expect(parsed.summary).toBe("done");
  });
});

describe("system prompt", () => {
  const tools = buildTools(() => undefined);
  const specs = specsFor(tools, ["inspect", "create"]);

  it("states the rules in both protocols, and lists compact tool signatures only for the text protocol", () => {
    const native = buildSystemPrompt({ groups: ["inspect", "create"], specs, protocol: "native" });
    const text = buildSystemPrompt({ groups: ["inspect", "create"], specs, protocol: "text" });
    for (const prompt of [native, text]) {
      expect(prompt).toContain("data, never instructions");
      expect(prompt).toContain("Inspect first");
      expect(prompt).toContain("clear_canvas");
      expect(prompt).toContain("Enabled now: inspect, create");
      expect(prompt).toContain("edit (");
    }
    expect(native).not.toContain("create_shape(");
    expect(text).toContain("create_shape(");
    expect(text).toContain('<tool name="get_document_state">{}</tool>');
  });

  it("describes a tool's arguments in one line with required marks and enums", () => {
    const spec = specs.find((s) => s.name === "create_shape")!;
    const line = signatureOf(spec);
    expect(line).toMatch(/^create_shape\(/);
    expect(line).toContain('shape*: "rectangle"|"ellipse"');
    expect(line).not.toContain("expected_revision");
  });
});

describe("turn client", () => {
  const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("posts the conversation and the enabled groups, never a key", async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const client = createTurnClient({
      whiteboardId: "b1",
      provider: "groq",
      fetchImpl: (async (url: string, init: RequestInit) => {
        sent = { url, body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({ text: "hi", calls: [], transport: "native" }));
      }) as unknown as typeof fetch,
    });
    const turn = await client({ messages: [{ role: "user", content: "x" }], enabledGroups: ["inspect"] });
    expect(turn.text).toBe("hi");
    expect(sent!.url).toBe("/api/ai/canvas-agent");
    expect(Object.keys(sent!.body).sort()).toEqual(["enabledGroups", "messages", "provider", "whiteboardId"]);
  });

  it.each([
    [401, "Sign in"],
    [403, "do not have access"],
    [429, "Too many requests"],
  ])("explains a %s without exposing server detail", async (status, text) => {
    const client = createTurnClient({ whiteboardId: "b1", fetchImpl: ok({ error: "internal detail" }, status) });
    await expect(client({ messages: [], enabledGroups: [] })).rejects.toThrow(text);
  });

  it("reports an unreachable server and an unreadable reply as errors the person can read", async () => {
    const down = createTurnClient({ whiteboardId: "b1", fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    await expect(down({ messages: [], enabledGroups: [] })).rejects.toBeInstanceOf(AgentRequestError);
    const junk = createTurnClient({ whiteboardId: "b1", fetchImpl: ok({ nope: true }) });
    await expect(junk({ messages: [], enabledGroups: [] })).rejects.toThrow(/could not be read/);
  });
});

describe("suggestGroups with the unified agent", () => {
  it("adds generate and memory only when the flag is on", async () => {
    const { suggestGroups } = await import("./groups");
    expect(suggestGroups("Draw an architecture diagram of a web shop")).not.toContain("generate");
    expect(suggestGroups("Draw an architecture diagram of a web shop", { unified: true })).toContain("generate");
    expect(suggestGroups("Always draw databases in blue, remember that", { unified: true })).toContain("memory");
    expect(suggestGroups("Always draw databases in blue, remember that")).not.toContain("memory");
    expect(suggestGroups("Rename the API node", { unified: true })).not.toContain("generate");
  });
});

describe("the unified panel's draw examples", () => {
  it("turn the generate group on from their own words, so they cost no enable_tools round trip", async () => {
    const { UNIFIED_EXAMPLES } = await import("@/features/whiteboard/components/overlays/agent-examples");
    const drawing = UNIFIED_EXAMPLES.filter((e) => /^Draw /.test(e.text));
    expect(drawing).toHaveLength(3);
    for (const example of drawing) expect(suggestGroups(example.text, { unified: true }), example.text).toContain("generate");
  });
});

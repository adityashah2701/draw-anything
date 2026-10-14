import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatGroq } from "@langchain/groq";
import { modelGraphDraftSchema, normalizeModelGraphDraft } from "@/features/ai/schemas";
import { callStructuredNormalized } from "@/features/ai/server/agents/types";
import { SchemaValidationError, toUserFacingMessage } from "@/features/ai/server/errors";
import { createPromptedStructuredModel } from "@/features/ai/server/model-providers";

/**
 * The real ChatGroq client talking to a local stand-in for Groq's API (no live
 * service). The stand-in behaves like the model did in production with
 * openai/gpt-oss-120b:
 *  - asked for strict `json_schema` output it answers with every optional field
 *    present as null (what Groq's strict mode forces);
 *  - given no schema anywhere in the prompt it answers in prose.
 */
type Reply = { content: string | null; finish_reason?: string };
type Captured = { messages: Array<{ role: string; content: string }>; response_format?: { type?: string }; tools?: unknown };

let server: Server;
let baseUrl = "";
let captured: Captured[] = [];
let script: Reply[] = [];

const longLabel = "Validate the user's credentials against the identity provider and issue a session";
const nodes = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    label: i === 1 ? longLabel : `Step ${i}`,
    kind: null,
    layer: null,
    column: null,
    parentId: null,
    description: null,
    priority: null,
  }));
const goodAnswer = (count = 30) =>
  JSON.stringify({
    nodes: nodes(count), // more than the strict schema's 25
    edges: [{ id: null, from: "n0", to: "n1", label: null, relationship: null, bidirectional: null, dashed: null }],
    groups: null,
  });

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const request = JSON.parse(body) as Captured;
      captured.push(request);
      const last = request.messages.at(-1)?.content ?? "";
      const asksForSchema = request.response_format?.type === "json_schema" || /JSON Schema/.test(last);
      const reply: Reply = asksForSchema
        ? (script.shift() ?? { content: goodAnswer() })
        : { content: "Sure! Here is a flowchart of the login process: first the user opens the page…" };
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "c1",
          object: "chat.completion",
          created: 1,
          model: "openai/gpt-oss-120b",
          choices: [{ index: 0, finish_reason: reply.finish_reason ?? "stop", message: { role: "assistant", content: reply.content } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  captured = [];
  script = [];
});

const groqModel = () =>
  createPromptedStructuredModel(new ChatGroq({ model: "openai/gpt-oss-120b", apiKey: "test-key-not-real", baseUrl }));

const generate = (model = groqModel()) =>
  callStructuredNormalized(model, modelGraphDraftSchema, "ai_domain_graph", [["human", "login flow"]], normalizeModelGraphDraft);

describe("Groq gpt-oss through the prompted structured model", () => {
  it("asks in the prompt, not through Groq's strict / tool modes", async () => {
    await generate();
    expect(captured).toHaveLength(1);
    expect(captured[0].response_format).toBeUndefined();
    expect(captured[0].tools).toBeUndefined();
    const last = captured[0].messages.at(-1)!.content;
    expect(last).toContain("JSON Schema");
    expect(last).toContain('"nodes"');
    expect(captured[0].messages[0]).toMatchObject({ role: "user", content: "login flow" });
  });

  it("accepts what strict Zod validation used to reject: nulls, long labels, many nodes", async () => {
    const graph = await generate();
    expect(graph.nodes).toHaveLength(30);
    expect(longLabel.length).toBeGreaterThan(60); // the old strict schema's limit
    expect(graph.nodes.every((node) => node.label.length <= 80)).toBe(true); // the normaliser's limit
    expect(graph.nodes[1].label.length).toBeGreaterThan(60);
    expect(graph.edges).toHaveLength(1);
    expect(captured).toHaveLength(1); // no fallback request
  });

  it("reads JSON that is wrapped in reasoning chatter and fences", async () => {
    script = [{ content: `Let me think about {steps} first.\n\`\`\`json\n${goodAnswer(4)}\n\`\`\`\nHope that helps!` }];
    expect((await generate()).nodes).toHaveLength(4);
  });

  it("re-asks once when the first reply is prose, showing the model its answer", async () => {
    script = [{ content: "I'd draw it like this: start, then login, then done." }, { content: goodAnswer(3) }];
    expect((await generate()).nodes).toHaveLength(3);
    expect(captured).toHaveLength(2);
    const second = captured[1].messages.map((m) => m.content).join("\n");
    expect(second).toContain("I'd draw it like this");
    expect(second).toContain("not a single valid JSON object");
  });

  it("re-asks once when the reply is empty (reasoning ate the budget)", async () => {
    script = [{ content: null }, { content: goodAnswer(3) }];
    expect((await generate()).nodes).toHaveLength(3);
    expect(captured).toHaveLength(2);
  });

  it("gives up after one re-ask with the 'invalid response' error, never looping", async () => {
    script = [{ content: "no json here" }, { content: "still no json" }];
    const error = await generate().catch((e) => e);
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(captured).toHaveLength(2);
    expect(toUserFacingMessage(error)).toMatch(/invalid response/i);
  });

  it("tells the user when the answer was cut off by the token limit", async () => {
    const cut = { content: goodAnswer(10).slice(0, 200), finish_reason: "length" };
    script = [cut, cut];
    const error = await generate().catch((e) => e);
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(toUserFacingMessage(error)).toMatch(/cut off/i);
    const second = captured[1].messages.at(-2)!.content;
    expect(second).toMatch(/cut off/i); // the re-ask asks for a shorter answer
  });
});

describe("createPromptedStructuredModel", () => {
  const fakeBase = (content: unknown, response_metadata?: Record<string, unknown>) => {
    const seen: unknown[][] = [];
    return {
      seen,
      base: {
        invoke: async (messages: unknown[]) => {
          seen.push(messages);
          return { content, response_metadata };
        },
      },
    };
  };

  it("reads content delivered as blocks", async () => {
    const { base } = fakeBase([{ type: "text", text: '{"nodes":[' }, { type: "text", text: '{"id":"a","label":"A"}]}' }]);
    const out = await createPromptedStructuredModel(base as never).withStructuredOutput(modelGraphDraftSchema).invoke([["human", "x"]]);
    expect(out).toEqual({ nodes: [{ id: "a", label: "A" }] });
  });

  it("appends one instruction after the caller's messages without mutating them", async () => {
    const { base, seen } = fakeBase('{"nodes":[]}');
    const input: Array<[string, string]> = [["system", "s"], ["human", "h"]];
    await createPromptedStructuredModel(base as never).withStructuredOutput(modelGraphDraftSchema).invoke(input as never);
    expect(input).toHaveLength(2);
    expect(seen[0]).toHaveLength(3);
    expect((seen[0][2] as string[])[0]).toBe("human");
  });

  it("passes plain invoke through unchanged", async () => {
    const { base, seen } = fakeBase("hi");
    await createPromptedStructuredModel(base as never).invoke([["human", "x"]] as never);
    expect(seen[0]).toEqual([["human", "x"]]);
  });
});

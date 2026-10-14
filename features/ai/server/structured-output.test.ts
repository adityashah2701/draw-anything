import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAIChatModel,
  describeSchemaForPrompt,
} from "@/features/ai/server/model-providers";
import {
  modelGraphDraftSchema,
  modelPlanSchema,
  normalizeModelGraphDraft,
} from "@/features/ai/schemas";
import { callStructuredNormalized } from "@/features/ai/server/agents/types";
import { SchemaValidationError } from "@/features/ai/server/errors";
import { extractJsonFromText } from "@/features/ai/server/json-extract";
import type { StructuredChatModel } from "@/features/ai/server/model-providers";

describe("describeSchemaForPrompt", () => {
  it("describes the real structure, not {type: STRING} (Zod 4 schemas expose .type)", () => {
    const graph = JSON.parse(describeSchemaForPrompt(modelGraphDraftSchema));
    expect(graph.type).toBe("object");
    expect(graph.required).toContain("nodes");
    expect(graph.required).not.toContain("edges"); // optional stays optional
    expect(graph.properties.nodes.type).toBe("array");
    expect(graph.properties.nodes.items.type).toBe("object");
    expect(Object.keys(graph.properties.nodes.items.properties)).toEqual(
      expect.arrayContaining(["id", "label", "kind"]),
    );
    expect(graph).not.toHaveProperty("$schema");

    const plan = JSON.parse(describeSchemaForPrompt(modelPlanSchema));
    expect(plan.properties).toHaveProperty("diagramType");
    expect(plan.properties.requirements.items.properties).toHaveProperty("text");
  });

  it("passes plain JSON Schema objects through and survives junk", () => {
    expect(JSON.parse(describeSchemaForPrompt({ type: "object", properties: { a: { type: "string" } } })))
      .toEqual({ type: "object", properties: { a: { type: "string" } } });
    expect(JSON.parse(describeSchemaForPrompt(undefined))).toEqual({ type: "object" });
    expect(JSON.parse(describeSchemaForPrompt("nope"))).toEqual({ type: "object" });
  });
});

describe("Gemini adapter", () => {
  const original = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  });

  const withStub = (responseText: string) => {
    const model = createAIChatModel("gemini") as unknown as {
      client: { models: { generateContent: (req: unknown) => Promise<{ text: string }> } };
      withStructuredOutput: (schema: unknown) => { invoke: (input: unknown) => Promise<unknown> };
    };
    const requests: Array<{ contents: Array<{ parts: Array<{ text: string }> }> }> = [];
    model.client.models.generateContent = async (req) => {
      requests.push(req as never);
      return { text: responseText };
    };
    return { model, requests };
  };

  it("sends the real schema in the request it makes", async () => {
    const { model, requests } = withStub('{"nodes":[]}');
    await model.withStructuredOutput(modelGraphDraftSchema).invoke([["user", "draw"]]);
    const sent = requests[0].contents.at(-1)!.parts[0].text;
    expect(sent).not.toContain('{"type":"STRING"}');
    expect(sent).toContain('"nodes"');
    expect(sent).toContain('"label"');
  });

  it("accepts JSON wrapped in a markdown fence", async () => {
    const { model } = withStub('```json\n{"nodes":[{"id":"a","label":"A"}]}\n```');
    await expect(model.withStructuredOutput(modelGraphDraftSchema).invoke([["user", "x"]])).resolves.toEqual({
      nodes: [{ id: "a", label: "A" }],
    });
  });

  it("reports unparseable output with a message callStructured recognises as a parse failure", async () => {
    const { model } = withStub("I'm sorry, I can't do that.");
    await expect(model.withStructuredOutput(modelGraphDraftSchema).invoke([["user", "x"]])).rejects.toThrow(
      /JSON/,
    );
  });
});

describe("extractJsonFromText", () => {
  it("extracts from fences and chatter, rejects non-objects", () => {
    expect(extractJsonFromText('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonFromText('here: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
    expect(extractJsonFromText("no json")).toBeNull();
    expect(extractJsonFromText("{broken")).toBeNull();
    expect(extractJsonFromText("[1,2,3]")).toBeNull();
  });
});

describe("callStructuredNormalized", () => {
  const scripted = (...responses: unknown[]) => {
    const seen: unknown[][] = [];
    const model = {
      withStructuredOutput: () => ({
        invoke: vi.fn(async (messages: unknown[]) => {
          seen.push(messages);
          return responses[Math.min(seen.length - 1, responses.length - 1)];
        }),
      }),
      invoke: vi.fn(),
    } as unknown as StructuredChatModel;
    return { model, seen };
  };

  it("makes a single call when the first answer is usable", async () => {
    const { model, seen } = scripted({ nodes: [{ id: "a", label: "A" }] });
    const graph = await callStructuredNormalized(
      model, modelGraphDraftSchema, "t", [["user", "draw"]], normalizeModelGraphDraft,
    );
    expect(graph.nodes).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });

  it("re-asks once with the model's own answer and the problem, then succeeds", async () => {
    const { model, seen } = scripted({ nodes: [] }, { nodes: [{ id: "a", label: "A" }] });
    const graph = await callStructuredNormalized(
      model, modelGraphDraftSchema, "t", [["user", "draw"]], normalizeModelGraphDraft,
    );
    expect(graph.nodes[0].label).toBe("A");
    expect(seen).toHaveLength(2);
    const second = JSON.stringify(seen[1]);
    expect(second).toContain("could not be used");
    expect(second).toContain("no usable nodes");
    expect(second).toContain('{\\"nodes\\":[]}'); // shows its previous answer
  });

  it("gives up with a typed error after the bounded number of re-asks", async () => {
    const { model, seen } = scripted({ nodes: [] });
    await expect(
      callStructuredNormalized(model, modelGraphDraftSchema, "t", [["user", "draw"]], normalizeModelGraphDraft),
    ).rejects.toBeInstanceOf(SchemaValidationError);
    expect(seen).toHaveLength(2); // original + exactly one re-ask, never a loop
  });

  it("does not re-ask when maxReasks is 0", async () => {
    const { model, seen } = scripted({ nodes: [] });
    await expect(
      callStructuredNormalized(model, modelGraphDraftSchema, "t", [["user", "draw"]], normalizeModelGraphDraft, {
        maxReasks: 0,
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
    expect(seen).toHaveLength(1);
  });
});

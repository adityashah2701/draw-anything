import { describe, expect, it } from "vitest";
import { extractJsonFromText, parseModelJson } from "@/features/ai/server/json-extract";
import { UnparseableModelOutputError } from "@/features/ai/server/errors";

describe("extractJsonFromText", () => {
  it("skips stray braces in the preamble and takes the real object", () => {
    expect(extractJsonFromText('Using the {schema} I would answer {"a":{"b":1}} ok')).toEqual({ a: { b: 1 } });
  });

  it("prefers the largest object when several parse", () => {
    expect(extractJsonFromText('{"x":1} then {"nodes":[{"id":"a"}],"edges":[]}')).toEqual({ nodes: [{ id: "a" }], edges: [] });
  });

  it("is not fooled by braces and quotes inside strings", () => {
    expect(extractJsonFromText('{"label":"a } b { \\" c","n":1}')).toEqual({ label: 'a } b { " c', n: 1 });
  });

  it("repairs trailing commas", () => {
    expect(extractJsonFromText('{"nodes":[{"id":"a",},],}')).toEqual({ nodes: [{ id: "a" }] });
  });

  it("never returns an object nested inside a truncated answer", () => {
    expect(extractJsonFromText('{"nodes":[{"id":"a","label":"A"},{"id":"b","label":"B')).toBeNull();
  });

  it("returns null for arrays, prose and broken objects", () => {
    expect(extractJsonFromText("[1,2]")).toBeNull();
    expect(extractJsonFromText("nothing here")).toBeNull();
    expect(extractJsonFromText("{not: json}")).toBeNull();
  });

  it("handles a large answer quickly", () => {
    const big = JSON.stringify({ nodes: Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })) });
    const started = Date.now();
    expect(extractJsonFromText(`preamble ${big} trailer`)?.nodes).toHaveLength(5000);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("parseModelJson", () => {
  const reasonOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof UnparseableModelOutputError ? e.reason : `other: ${e}`;
    }
    return "no error";
  };

  it("parses plain JSON, fenced JSON and a JSON string that contains JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson(JSON.stringify('{"a":1}'))).toEqual({ a: 1 });
  });

  it("explains why it could not read the reply", () => {
    expect(reasonOf(() => parseModelJson(""))).toBe("empty");
    expect(reasonOf(() => parseModelJson("   \n"))).toBe("empty");
    expect(reasonOf(() => parseModelJson("Sure, here you go!"))).toBe("not-json");
    expect(reasonOf(() => parseModelJson("[1,2,3]"))).toBe("not-json");
    expect(reasonOf(() => parseModelJson('{"nodes":[{"id":"a"', "length"))).toBe("truncated");
    expect(reasonOf(() => parseModelJson("", "length"))).toBe("truncated");
  });

  it("does not trust a complete-looking object when the model was cut off", () => {
    // `finish_reason: length` means more was coming; a nested complete object is not the answer.
    expect(reasonOf(() => parseModelJson('{"nodes":[{"id":"a"}], "edges":[{"from":"a"', "length"))).toBe("truncated");
  });

  it("keeps the model's text on the error for the re-ask and the log", () => {
    try {
      parseModelJson("I cannot do that");
    } catch (e) {
      expect((e as UnparseableModelOutputError).rawText).toBe("I cannot do that");
      return;
    }
    throw new Error("should have thrown");
  });
});

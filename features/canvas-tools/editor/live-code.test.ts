import { describe, expect, it } from "vitest";
import { codeSoFar } from "./live-code";

describe("codeSoFar", () => {
  it("returns the complete lines of an unfinished block, closing open frames", () => {
    expect(codeSoFar("Planning.")).toBeNull();
    const partial = codeSoFar("Here.\n```diagram\ntype architecture\nframe Edge {\n  CDN [icon: cdn]\n  Load Bal");
    expect(partial).toEqual({ code: "type architecture\nframe Edge {\n  CDN [icon: cdn]\n}", lines: 3, closed: false });
    expect(codeSoFar("```diagram\nA > B\n```\nDone.")).toEqual({ code: "A > B", lines: 1, closed: true });
  });
});

describe("the streamed turn", () => {
  it("passes text deltas on as they arrive and returns the final turn", async () => {
    const { createTurnClient } = await import("../agent/client");
    const lines = ['{"d":"```diagram\\nA > B"}\n{"d":"\\n```"}\n', '{"turn":{"text":"```diagram\\nA > B\\n```","calls":[]}}\n'];
    const body = new ReadableStream<Uint8Array>({ start(c) { lines.forEach((l) => c.enqueue(new TextEncoder().encode(l))); c.close(); } });
    const fetchImpl = (async () => new Response(body, { headers: { "Content-Type": "application/x-ndjson" } })) as unknown as typeof fetch;
    const deltas: string[] = [];
    const turn = await createTurnClient({ whiteboardId: "b", fetchImpl, onDelta: (d) => deltas.push(d) })({ messages: [{ role: "user", content: "hi" }], enabledGroups: [] });
    expect(deltas.join("")).toBe("```diagram\nA > B\n```");
    expect(turn.text).toContain("A > B");
  });
});

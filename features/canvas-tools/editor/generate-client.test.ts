import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { node } from "../test-helpers";
import { generateElements } from "./generate-client";

const sse = (events: unknown[], chunk = 37) => {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < text.length; i += chunk) controller.enqueue(encoder.encode(text.slice(i, i + chunk)));
      controller.close();
    },
  });
};
const responding = (body: ReadableStream<Uint8Array> | null, init: ResponseInit = { status: 200 }) => (async () => new Response(body, init)) as unknown as typeof fetch;
const base = { whiteboardId: "board_1", description: "an API" };
const el = (id: string, label = id): DrawingElement => node(id, label, 0, 0);
const done = { type: "frame.done", frameId: "f", count: 2, graph: {} };

describe("generateElements", () => {
  it("collects the final element set from the stream, folding in updates and removals, across chunk boundaries", async () => {
    const events = [
      { type: "frame.created", frame: { frameId: "f" } },
      { type: "element.batch", frameId: "f", elements: [el("a"), el("b")] },
      { type: "element.batch", frameId: "f", elements: [el("c")] },
      { type: "element.update", frameId: "f", elements: [el("a", "A2"), el("zzz")] },
      { type: "element.remove", frameId: "f", elementIds: ["b"] },
      { type: "validation.report", frameId: "f", report: { valid: false, issues: [{}, {}] } },
      done,
    ];
    const out = await generateElements({ ...base, fetchImpl: responding(sse(events)) });
    expect(out.elements.map((e) => [e.id, e.label])).toEqual([["a", "A2"], ["c", "c"]]);
    expect(out.warnings).toEqual(["The diagram check found 2 issue(s)."]);
  });

  it("sends the request the endpoint expects, with the diagram type and the provider", async () => {
    let sent: { body: Record<string, unknown>; signal?: AbortSignal | null } | undefined;
    const controller = new AbortController();
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/ai/generate-diagram");
      sent = { body: JSON.parse(String(init.body)), signal: init.signal };
      return new Response(sse([{ type: "element.batch", frameId: "f", elements: [el("a")] }, done]));
    }) as unknown as typeof fetch;
    await generateElements({ ...base, provider: "groq", diagramType: "flowchart", signal: controller.signal, fetchImpl });
    expect(sent?.body).toEqual({ prompt: "an API\n\nDiagram type: flowchart.", model: "groq", provider: "groq", whiteboardId: "board_1" });
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
    expect(sent?.signal?.aborted).toBe(false);
  });

  it("fails with the generator's message, and never returns a half result", async () => {
    await expect(generateElements({ ...base, fetchImpl: responding(sse([{ type: "element.batch", frameId: "f", elements: [el("a")] }, { type: "frame.error", frameId: "f", message: "Model overloaded" }])) })).rejects.toThrow("Model overloaded");
    await expect(generateElements({ ...base, fetchImpl: responding(sse([{ type: "element.batch", frameId: "f", elements: [el("a")] }])) })).rejects.toThrow(/stopped before it finished/);
  });

  it("turns HTTP failures into short messages without payloads", async () => {
    await expect(generateElements({ ...base, fetchImpl: responding(null, { status: 429 }) })).rejects.toThrow("Too many diagram requests");
    await expect(generateElements({ ...base, fetchImpl: responding(new Response(JSON.stringify({ error: "No AI provider is configured on this server." })).body, { status: 503 }) })).rejects.toThrow("No AI provider is configured");
    await expect(generateElements({ ...base, fetchImpl: responding(null, { status: 500 }) })).rejects.toThrow("could not be generated");
  });

  it("ignores lines that are not events", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const e = new TextEncoder();
        c.enqueue(e.encode(`: keep-alive\n\ndata: {broken\n\ndata: ${JSON.stringify({ type: "element.batch", frameId: "f", elements: [el("a")] })}\n\ndata: ${JSON.stringify(done)}\n\n`));
        c.close();
      },
    });
    expect((await generateElements({ ...base, fetchImpl: responding(body) })).elements.map((x) => x.id)).toEqual(["a"]);
  });

  it("reports what the generator is doing as it goes", async () => {
    const seen: string[] = [];
    const events = [
      { type: "phase.started", frameId: "f", phase: "diagramComposer", message: "Building the diagram step by step" },
      { type: "agent.note", frameId: "f", note: { kind: "add", title: "Added the launch branches" } },
      { type: "element.batch", frameId: "f", elements: [el("a"), el("b")] },
      done,
    ];
    await generateElements({ ...base, onProgress: (t) => seen.push(t), fetchImpl: responding(sse(events)) });
    expect(seen).toEqual(["Building the diagram step by step", "Added the launch branches", "Drawing the diagram: 2 elements so far"]);
  });

  /** A response that sends nothing more, like a model call that never comes back. */
  const silent = (first?: unknown) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        if (first) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(first)}\n\n`));
      },
    });

  it("gives up with a plain message when the generator sends nothing for too long", async () => {
    await expect(generateElements({ ...base, idleMs: 30, fetchImpl: responding(silent({ type: "frame.created", frame: { frameId: "f" } })) })).rejects.toThrow(/no sign of progress for 1 seconds.*Nothing was added/);
  });

  it("gives up when the whole generation takes too long, even if it keeps sending", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const tick = setInterval(() => {
          try {
            c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "phase.started", frameId: "f", phase: "diagramComposer", message: "Still going" })}\n\n`));
          } catch {
            clearInterval(tick);
          }
        }, 5);
      },
    });
    await expect(generateElements({ ...base, idleMs: 5_000, totalMs: 60, fetchImpl: responding(body) })).rejects.toThrow(/still working after 1 seconds/);
  });

  it("a person's Stop ends it as an abort, not as a failure message, and does not wait for the model", async () => {
    const controller = new AbortController();
    const pending = generateElements({ ...base, signal: controller.signal, fetchImpl: responding(silent()) });
    setTimeout(() => controller.abort(new DOMException("Stopped by the person.", "AbortError")), 10);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("is already stopped when the signal was aborted before the call", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Stopped by the person.", "AbortError"));
    await expect(generateElements({ ...base, signal: controller.signal, fetchImpl: responding(silent()) })).rejects.toMatchObject({ name: "AbortError" });
  });
});

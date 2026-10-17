import { describe, expect, it } from "vitest";
import type { AIStreamEvent } from "@/features/ai/types";
import { call, scripted, turn } from "./builder/testing";
import { revealChunks, streamDiagramBuilderEvents } from "./run-builder";

const collect = async (script: Parameters<typeof scripted>[0]) => {
  const events: AIStreamEvent[] = [];
  for await (const event of streamDiagramBuilderEvents({ request: { prompt: "login flow", provider: "groq" }, transport: scripted(script).transport, revealMs: 0 })) {
    events.push(event);
  }
  return events;
};

describe("streamDiagramBuilderEvents", () => {
  it("streams the canvas step by step: batches, then updates and removals of what is already drawn", async () => {
    const events = await collect([
      turn(call("add", "type flowchart\nStart [kind: start]\nStart > Enter Credentials")),
      turn(call("add", "Enter Credentials > Valid?")),
      turn(call("adjust", "move Valid?: right 120")),
      turn(call("adjust", "remove Valid?")),
      turn(call("finish")),
    ]);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("frame.created");
    expect(types.at(-1)).toBe("frame.done");

    const batches = events.filter((e): e is Extract<AIStreamEvent, { type: "element.batch" }> => e.type === "element.batch");
    // Each shape and connector arrives as its own piece, so a step still appears one by one.
    expect(batches.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...batches.map((b) => b.elements.length))).toBeLessThanOrEqual(3);

    const update = events.find((e) => e.type === "element.update");
    expect(update && "elements" in update ? update.elements.length : 0).toBeGreaterThan(0);
    const removal = events.find((e): e is Extract<AIStreamEvent, { type: "element.remove" }> => e.type === "element.remove");
    expect(removal?.elementIds.length).toBeGreaterThan(0);

    // The drawing events come in the order the steps happened, between the first phase and the end.
    const firstBatch = types.indexOf("element.batch");
    expect(types.indexOf("element.update")).toBeGreaterThan(firstBatch);
    expect(types.indexOf("element.remove")).toBeGreaterThan(types.indexOf("element.update"));
  });

  it("reports each step as a note for the timeline, with the facts behind it", async () => {
    const events = await collect([
      { text: "Putting the entry point first so the flow reads top to bottom.", toolCalls: [call("add", "Start > Check\nCheck > Done")] },
      turn(call("finish")),
    ]);
    const notes = events.filter((e): e is Extract<AIStreamEvent, { type: "agent.note" }> => e.type === "agent.note").map((e) => e.note);
    expect(notes[0]).toMatchObject({ kind: "reasoning", text: expect.stringContaining("entry point first") });
    const add = notes.find((n) => n.kind === "add")!;
    expect(add.title).toBe("Added 3 components and 2 connections");
    expect(add.items).toEqual(expect.arrayContaining(["Start", "Check", "Start > Check"]));
    expect(add.text).toMatch(/It reads: Start → Check → Done/);
    expect(notes.at(-1)).toMatchObject({ kind: "summary" });
    expect(notes.at(-1)?.title).toMatch(/^Done: 3 components and 2 connections/);
  });

  it("ends with the final graph and the element count on frame.done", async () => {
    const events = await collect([turn(call("add", "A > B")), turn(call("finish"))]);
    const done = events.at(-1);
    expect(done?.type).toBe("frame.done");
    if (done?.type === "frame.done") {
      expect(done.count).toBeGreaterThan(2);
      expect(done.graph.nodes).toHaveLength(2);
    }
  });

  it("fails like the other pipelines when nothing was ever drawn", async () => {
    await expect(collect([turn()])).rejects.toThrow();
  });
});

describe("revealChunks", () => {
  const node = (id: string, x: number, y: number) => ({ id, type: "semantic-node", points: [{ x, y }, { x: x + 100, y: y + 50 }], color: "#000", strokeWidth: 2, ai: { role: "node" } }) as never;
  const label = (id: string) => ({ id, type: "text", points: [{ x: 5, y: 5 }], color: "#000", strokeWidth: 1, ai: { role: "edge-label" } }) as never;

  it("shows shapes one by one and keeps a label with its connector", () => {
    const chunks = revealChunks([node("a", 0, 0), node("b", 0, 100), label("l")], false);
    expect(chunks.map((c) => c.map((e: { id: string }) => e.id))).toEqual([["a"], ["b", "l"]]);
  });

  it("puts the elements at the top-left edge in the first piece, so the client anchors on the right corner", () => {
    const chunks = revealChunks([node("mid", 100, 100), node("left", 0, 150), node("top", 150, 0), node("far", 300, 300)], true);
    const first = chunks[0].map((e: { id: string }) => e.id).sort();
    expect(first).toEqual(["left", "top"]);
    expect(chunks.flat()).toHaveLength(4);
  });
});

describe("streamDiagramBuilderEvents when the quota runs out", () => {
  it("finishes with a message that says so and keeps the shapes already drawn", async () => {
    let calls = 0;
    const base = scripted([turn(call("add", "A > B")), turn(call("finish"))]).transport;
    const transport = {
      kind: "native" as const,
      async complete(messages: Parameters<typeof base.complete>[0], options?: Parameters<typeof base.complete>[1]) {
        calls += 1;
        if (calls > 1) throw new Error("429 quota exceeded: tokens per day (TPD)");
        return base.complete(messages, options);
      },
    };
    const events: AIStreamEvent[] = [];
    for await (const e of streamDiagramBuilderEvents({ request: { prompt: "x", provider: "groq" }, transport, revealMs: 0 })) events.push(e);
    expect(events.at(-1)?.type).toBe("frame.done");
    expect(events.some((e) => e.type === "agent.note" && e.note.kind === "stopped" && /quota or rate limit/.test(e.note.text ?? ""))).toBe(true);
    expect(events.some((e) => e.type === "element.batch")).toBe(true);
  });
});

describe("edit mode", () => {
  const board = async () => {
    const { buildCanvas } = await import("./builder/canvas");
    const { addLines, createState } = await import("./builder/state");
    return buildCanvas(addLines(createState(), "type flowchart\nStart [kind: start]\nStart > Check\nCheck > Done").state, "old", "old-frame")!.elements;
  };

  it("shows the model the diagram on the board, removes its elements just before redrawing, and keeps what the agent adds", async () => {
    const elements = await board();
    const m = scripted([turn(call("add", "Check > Retry: failed")), turn(call("finish"))]);
    const events: AIStreamEvent[] = [];
    for await (const e of streamDiagramBuilderEvents({ request: { prompt: "add a retry", provider: "groq", edit: true, canvasContext: { elements } }, transport: m.transport, revealMs: 0 })) events.push(e);

    // The first thing the model sees is the existing diagram, not an empty canvas.
    expect(m.shown[0]).toContain("Start > Check");
    expect(m.shown[0]).not.toContain("(empty)");
    expect(m.shown[0]).toContain("add a retry");

    const types = events.map((e) => e.type);
    const removal = events.find((e): e is Extract<AIStreamEvent, { type: "element.remove" }> => e.type === "element.remove")!;
    expect(removal.elementIds.sort()).toEqual(elements.map((el) => el.id).sort());
    expect(types.indexOf("element.remove")).toBeLessThan(types.indexOf("element.batch"));

    const done = events.at(-1) as Extract<AIStreamEvent, { type: "frame.done" }>;
    expect(done.graph?.nodes.map((n) => n.label ?? n.id)).toEqual(expect.arrayContaining(["Start", "Check", "Done", "Retry"]));
  });

  it("leaves the board alone and starts empty when edit is not asked for", async () => {
    const elements = await board();
    const m = scripted([turn(call("add", "A > B")), turn(call("finish"))]);
    const events: AIStreamEvent[] = [];
    for await (const e of streamDiagramBuilderEvents({ request: { prompt: "new", provider: "groq", canvasContext: { elements } }, transport: m.transport, revealMs: 0 })) events.push(e);
    expect(m.shown[0]).toContain("(empty)");
    expect(events.some((e) => e.type === "element.remove")).toBe(false);
  });
});

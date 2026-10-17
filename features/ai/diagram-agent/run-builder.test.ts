import { describe, expect, it } from "vitest";
import type { AIStreamEvent } from "@/features/ai/types";
import { call, scripted, turn } from "./builder/testing";
import { streamDiagramBuilderEvents } from "./run-builder";

const collect = async (script: Parameters<typeof scripted>[0]) => {
  const events: AIStreamEvent[] = [];
  for await (const event of streamDiagramBuilderEvents({ request: { prompt: "login flow", provider: "groq" }, transport: scripted(script).transport })) {
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
    expect(batches).toHaveLength(2);
    expect(batches[1].elements.length).toBeGreaterThan(0);

    const update = events.find((e) => e.type === "element.update");
    expect(update && "elements" in update ? update.elements.length : 0).toBeGreaterThan(0);
    const removal = events.find((e): e is Extract<AIStreamEvent, { type: "element.remove" }> => e.type === "element.remove");
    expect(removal?.elementIds.length).toBeGreaterThan(0);

    // The drawing events come in the order the steps happened, between the first phase and the end.
    const firstBatch = types.indexOf("element.batch");
    expect(types.indexOf("element.update")).toBeGreaterThan(firstBatch);
    expect(types.indexOf("element.remove")).toBeGreaterThan(types.indexOf("element.update"));
  });

  it("reports each step as a phase the chat can show", async () => {
    const events = await collect([turn(call("add", "A > B")), turn(call("finish"))]);
    const messages = events.filter((e) => e.type === "phase.completed").map((e) => ("message" in e ? e.message : ""));
    expect(messages.some((m) => /Added A/.test(m))).toBe(true);
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

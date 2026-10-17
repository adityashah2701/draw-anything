import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { call, scripted, turn } from "@/features/ai/diagram-agent/builder/testing";
import { streamDiagramBuilderEvents } from "@/features/ai/diagram-agent/run-builder";
import { encodeSse, toV1CompatibilityEvents } from "@/features/ai/server/sse";
import type { AIStreamEvent } from "@/features/ai/types";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

/** The bytes the real route sends for a run of the builder: each event, then its v1 compatibility events. */
const sseFor = async (script: Parameters<typeof scripted>[0]) => {
  // These tests are about the client applying updates, so the agent's big moves must not be undone by the guard.
  const events: AIStreamEvent[] = [];
  let body = "";
  for await (const event of streamDiagramBuilderEvents({ request: { prompt: "chain", provider: "groq" }, transport: scripted(script).transport, guardAdjustments: false, revealMs: 0 })) {
    events.push(event);
    body += encodeSse(event) + toV1CompatibilityEvents(event).map(encodeSse).join("");
  }
  return { body, events };
};

suite("builder agent stream in the real editor", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor();
  });
  afterEach(async () => {
    await s?.close();
  });

  const generate = async (body: string) => {
    await s.page.route("**/api/ai/generate-diagram", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body }));
    await s.page.evaluate(() => void window.__editor.controller!.triggerAIGeneration("chain", "groq"));
    await s.page.waitForFunction(() => window.__editor.controller!.isAIGenerating === false && window.__editor.controller!.elements.length > 0, undefined, { timeout: 15_000 });
  };

  it("draws the steps, then applies the moves and removals the agent made afterwards", async () => {
    const { body, events } = await sseFor([
      turn(call("add", "type flowchart\nIngest > Clean")),
      turn(call("add", "Clean > Publish\nClean > Archive")),
      turn(call("adjust", "move Archive: right 160")),
      turn(call("adjust", "remove Publish")),
      turn(call("finish")),
    ]);
    const done = events.find((e): e is Extract<AIStreamEvent, { type: "frame.done" }> => e.type === "frame.done")!;
    const expectedNodes = done.graph.nodes.map((n) => n.label).sort();
    expect(expectedNodes).toEqual(["Archive", "Clean", "Ingest"]);

    await generate(body);
    const elements = await s.elements();
    const labels = (type: string) => elements.filter((e: Record<string, any>) => e.type === type || e.ai?.role === "node").map((e: Record<string, any>) => e.label).filter(Boolean);
    // Publish was drawn, then taken off the board again; nothing of it is left, arrows included.
    expect(labels("semantic-node").sort()).toEqual(expectedNodes);
    expect(elements.some((e: Record<string, any>) => e.label === "Publish")).toBe(false);
    expect(elements.filter((e: Record<string, any>) => e.type === "arrow")).toHaveLength(2);
    // Every element on the board is one the final canvas has: updates replaced elements instead of adding copies.
    const ids = new Set(elements.map((e: Record<string, any>) => e.id));
    expect(ids.size).toBe(elements.length);
    expect(elements).toHaveLength(done.count);
    expect(s.problems.filter((p) => p.startsWith("pageerror"))).toEqual([]);
  });

  it("moves an element that was already drawn instead of adding a second one", async () => {
    const { body } = await sseFor([turn(call("add", "A > B")), turn(call("adjust", "move B: right 200")), turn(call("finish"))]);
    await generate(body);
    const nodes = (await s.elements()).filter((e: Record<string, any>) => e.ai?.role === "node") as Array<Record<string, any>>;
    const [a, b] = ["A", "B"].map((name) => nodes.find((n) => n.label === name)!);
    expect(nodes).toHaveLength(2);
    // B sits 200 to the right of where the layout alone would put it (directly under A).
    expect(b.points[0].x - a.points[0].x).toBeGreaterThan(150);
  });
});

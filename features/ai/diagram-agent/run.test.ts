import { describe, expect, it } from "vitest";
import { createGenerateDiagramHandler } from "@/features/ai/server/generate-diagram-handler";
import { createSlidingWindowLimiter } from "@/features/ai/server/request-guard";
import type { AIStreamEvent, AIWorkflowPhase } from "@/features/ai/types";
import { EXAMPLES } from "./prompt/examples";
import { streamDiagramAgentEvents } from "./run";
import type { ModelTurn, ToolTransport } from "./types";

const PHASES: AIWorkflowPhase[] = ["contextRetriever", "architecturePlanner", "domainModeler", "infrastructureExpander", "relationshipAgent", "diagramComposer", "layoutAgent", "validationAgent", "criticAgent", "repairAgent", "expansionAgent", "completenessCheck", "canvasCompiler"];
const GOOD = EXAMPLES[1].code;

const transportOf = (...turns: ModelTurn[]): ToolTransport & { calls: number } => {
  const t = {
    kind: "text" as const,
    calls: 0,
    async complete() {
      const turn = turns[Math.min(t.calls, turns.length - 1)];
      t.calls += 1;
      return turn;
    },
  };
  return t;
};
const finish = (code: string): ModelTurn => ({ text: "", toolCalls: [{ name: "finish", arg: code }] });
const collect = async (it: AsyncIterable<AIStreamEvent>) => {
  const out: AIStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
};
const request = { prompt: "web app backend", provider: "groq" as const };

describe("streamDiagramAgentEvents", () => {
  it("emits the legacy contract: frame.created, phases, one element.batch, frame.done", async () => {
    const events = await collect(streamDiagramAgentEvents({ request, transport: transportOf(finish(GOOD)) }));
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("frame.created");
    expect(types.at(-1)).toBe("frame.done");
    expect(types.filter((t) => t === "element.batch")).toHaveLength(1);
    expect(types.indexOf("element.batch")).toBeLessThan(types.indexOf("frame.done"));
    expect(types).not.toContain("frame.error");
  });

  it("frame.created carries everything the client stores; phases are ones Convex/client know", async () => {
    const events = await collect(streamDiagramAgentEvents({ request, transport: transportOf(finish(GOOD)) }));
    const created = events[0];
    if (created.type !== "frame.created") throw new Error("first event");
    expect(created.frame).toMatchObject({ prompt: "web app backend", provider: "groq", status: "queued" });
    expect(created.frame.frameId).toMatch(/^ai_frame_/);
    for (const e of events) {
      if (e.type === "phase.started" || e.type === "phase.completed") {
        expect(PHASES).toContain(e.phase);
        expect(e.frameId).toBe(created.frame.frameId);
        expect(e.message.length).toBeGreaterThan(0);
      }
    }
  });

  it("frame.done.graph is a Convex-safe document naming the real prompt and provider", async () => {
    const events = await collect(streamDiagramAgentEvents({ request, transport: transportOf(finish(GOOD)) }));
    const done = events.find((e) => e.type === "frame.done");
    if (done?.type !== "frame.done") throw new Error("no frame.done");
    expect(JSON.parse(JSON.stringify(done.graph))).toEqual(done.graph);
    expect(() => structuredClone(done.graph)).not.toThrow();
    expect(done.graph.metadata.provider).toBe("groq");
    expect(done.graph.nodes.length).toBeGreaterThan(8);
    const batch = events.find((e) => e.type === "element.batch");
    if (batch?.type !== "element.batch") throw new Error("no batch");
    expect(done.count).toBe(batch.elements.length);
    expect(batch.elements.some((el) => el.ai?.role === "node")).toBe(true);
    expect(batch.elements.every((el) => el.ai?.frameId === done.frameId)).toBe(true);
  });

  it("reports icon search and review while the model is still working", async () => {
    const t = transportOf(
      { text: "", toolCalls: [{ name: "search_icons", arg: "kafka" }, { name: "check_diagram", arg: GOOD }] },
      finish(GOOD),
    );
    const events = await collect(streamDiagramAgentEvents({ request, transport: t }));
    const messages = events.filter((e) => e.type === "phase.started").map((e) => (e as { message: string }).message);
    expect(messages).toEqual(expect.arrayContaining(["Choosing icons", "Checking layout and design"]));
  });

  it("an unreadable model throws a typed error (the HTTP handler turns it into frame.error)", async () => {
    const t = transportOf({ text: "graph TD; A-->B", toolCalls: [] });
    await expect(collect(streamDiagramAgentEvents({ request, transport: t, maxTurns: 2 }))).rejects.toMatchObject({ code: "UNPARSEABLE_OUTPUT" });
  });

  it("a consumer that stops early stops the agent: no further model calls", async () => {
    const t = transportOf({ text: "", toolCalls: [{ name: "check_diagram", arg: GOOD }] });
    const gen = streamDiagramAgentEvents({ request, transport: t });
    await gen.next(); // frame.created
    await gen.return(undefined);
    const after = t.calls;
    await new Promise((r) => setTimeout(r, 30));
    expect(t.calls).toBe(after);
  });

  it("works end to end behind the real HTTP handler", async () => {
    const handler = createGenerateDiagramHandler({
      getUserId: async () => "user_1",
      enabledProviders: () => ["groq"],
      limiter: createSlidingWindowLimiter({ max: 5, windowMs: 1000 }),
      runWorkflow: (req) => streamDiagramAgentEvents({ request: req, transport: transportOf(finish(GOOD)) }),
      pacingMs: 0,
    });
    const res = await handler(new Request("http://x/api", { method: "POST", body: JSON.stringify({ prompt: "web app backend", provider: "groq" }) }));
    const body = await res.text();
    const payloads = body.split("\n\n").filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
    const types = payloads.map((p) => p.type);
    expect(types).toContain("frame.created");
    expect(types).toContain("frame.done");
    expect(types).toContain("done"); // v1 compatibility event
    expect(types).not.toContain("error");
  });
});

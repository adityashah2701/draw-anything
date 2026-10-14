import { describe, expect, it } from "vitest";
import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";
import { StructuredChatModel } from "@/features/ai/server/model-providers";
import type { AIStreamEvent } from "@/features/ai/types";

class MockStructuredModel {
  private calls = 0;

  withStructuredOutput<T extends Record<string, unknown>>(_schema: unknown) {
    return {
      invoke: async (): Promise<T> => {
        this.calls += 1;
        if (this.calls === 1) {
          return {
            diagramType: "architecture",
            summary: "Client talks to API",
            layoutStrategy: "layered",
            direction: "top-to-bottom",
            styleTheme: "technical",
            density: "balanced",
            requirements: [
              {
                id: "client-api",
                text: "Client talks to API",
                priority: "must",
                source: "prompt",
              },
            ],
            actors: ["Client"],
            systems: ["API"],
            nonFunctionalRequirements: [],
            risks: [],
          } as unknown as T;
        }
        return {
          nodes: [
            { id: "client", label: "Client", kind: "browser" },
            { id: "api", label: "API", kind: "api" },
          ],
          edges: [{ id: "calls", from: "client", to: "api" }],
          groups: [],
        } as unknown as T;
      },
    };
  }
}

describe("AI LangGraph workflow", () => {
  it("streams frame, validation, element, and done events", async () => {
    const events = [];
    for await (const event of streamAIDiagramWorkflowEvents({
      request: {
        prompt: "Client API architecture",
        provider: "gemini",
      },
      model: new MockStructuredModel() as unknown as StructuredChatModel,
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "frame.created")).toBe(true);
    expect(events.some((event) => event.type === "memory.loaded")).toBe(true);
    expect(events.some((event) => event.type === "requirements.extracted")).toBe(true);
    expect(events.some((event) => event.type === "critic.report")).toBe(true);
    expect(events.some((event) => event.type === "validation.report")).toBe(true);
    expect(events.some((event) => event.type === "element.batch")).toBe(true);
    expect(events.at(-1)?.type).toBe("frame.done");
  });

  // Scripted model: answers the nth structured call with responses[n]
  // (the last one repeats). Call order is plan, domain graph, relationships, ...
  const scripted = (...responses: unknown[]) => {
    let calls = 0;
    const model = {
      withStructuredOutput: () => ({
        invoke: async () => responses[Math.min(calls++, responses.length - 1)],
      }),
    } as unknown as StructuredChatModel;
    return { model, callCount: () => calls };
  };

  const plan = (diagramType: string) => ({
    diagramType,
    summary: `A ${diagramType}`,
    layoutStrategy: "layered",
    direction: "top-to-bottom",
    styleTheme: "technical",
    density: "balanced",
  });

  const brokenGraph = {
    nodes: [{ id: "api", label: "API", kind: "api" }],
    edges: [{ from: "api", to: "missing" }],
    groups: [],
  };
  const goodGraph = {
    nodes: [
      { id: "client", label: "Client", kind: "browser" },
      { id: "api", label: "API", kind: "api" },
      { id: "database", label: "Database", kind: "database" },
    ],
    edges: [
      { from: "client", to: "api" },
      { from: "api", to: "database" },
    ],
    groups: [],
  };

  const run = async (model: StructuredChatModel) => {
    const events: AIStreamEvent[] = [];
    for await (const event of streamAIDiagramWorkflowEvents({
      request: { prompt: "Describe the flow", provider: "gemini" },
      model,
    })) {
      events.push(event);
    }
    return events;
  };

  it("applies a repair pass when the first graph is unusable and nothing needs expanding", async () => {
    // A flowchart is not checked for infrastructure layers, so the critic does
    // not expand it and the repair agent is the only way to recover.
    const { model } = scripted(plan("flowchart"), brokenGraph, brokenGraph, goodGraph);
    const events = await run(model);

    const repair = events.find((event) => event.type === "repair.applied");
    expect(repair).toBeDefined();
    const done = events.at(-1);
    expect(done?.type).toBe("frame.done");
    if (done?.type === "frame.done") {
      expect(done.graph.nodes).toHaveLength(3);
      expect(done.graph.validation.valid).toBe(true);
      expect(done.graph.validation.metrics.orphanNodes).toBe(0);
    }
  });

  it("recovers from an unusable first architecture graph through the expansion loop", async () => {
    // For an architecture the critic asks for missing layers and the expansion
    // round rebuilds the graph, so repair has nothing left to do.
    const { model } = scripted(plan("architecture"), brokenGraph, brokenGraph, goodGraph);
    const events = await run(model);

    const done = events.at(-1);
    expect(done?.type).toBe("frame.done");
    if (done?.type === "frame.done") {
      expect(done.graph.nodes.length).toBeGreaterThanOrEqual(3);
      expect(done.graph.validation.valid).toBe(true);
    }
  });

  it("does not add infrastructure nodes to a flowchart", async () => {
    const flow = {
      nodes: [
        { id: "start", label: "Start", kind: "workflow" },
        { id: "check", label: "Credentials valid?", kind: "decision" },
        { id: "home", label: "Show dashboard", kind: "workflow" },
        { id: "error", label: "Show error", kind: "workflow" },
      ],
      edges: [
        { from: "start", to: "check" },
        { from: "check", to: "home", label: "yes" },
        { from: "check", to: "error", label: "no" },
      ],
      groups: [],
    };
    const { model, callCount } = scripted(plan("flowchart"), flow, flow);
    const events = await run(model);

    const done = events.at(-1);
    expect(done?.type).toBe("frame.done");
    if (done?.type === "frame.done") {
      expect(done.graph.nodes.map((node) => node.label).sort()).toEqual([
        "Credentials valid?",
        "Show dashboard",
        "Show error",
        "Start",
      ]);
    }
    expect(callCount()).toBe(3); // plan, graph, relationships: no expansion, no repair
  });

  it.each([
    ["a clean run", "flowchart", "flow"],
    ["a repair run", "flowchart", "repair"],
    ["an expansion run", "architecture", "repair"],
  ])("puts each node on the canvas once, with no leftover draft (%s)", async (_name, diagramType, mode) => {
    const flow = {
      nodes: [
        { id: "client", label: "Client", kind: "browser" },
        { id: "api", label: "API", kind: "api" },
        { id: "database", label: "Database", kind: "database" },
      ],
      edges: [
        { from: "client", to: "api" },
        { from: "api", to: "database" },
      ],
      groups: [],
    };
    const responses =
      mode === "flow"
        ? [plan(diagramType), flow, flow]
        : [plan(diagramType), brokenGraph, brokenGraph, flow];
    const { model } = scripted(...responses);
    const events = await run(model);

    const batches = events.filter((event) => event.type === "element.batch");
    // Streaming a draft and then the final diagram left both on the canvas
    // whenever repair or expansion rebuilt the graph (new generation id).
    expect(batches).toHaveLength(1);
    const elements = batches[0].type === "element.batch" ? batches[0].elements : [];
    const labels = elements.filter((e) => e.type === "semantic-node").map((e) => e.label);
    expect(labels.sort()).toEqual(["API", "Client", "Database"]);
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
  });
});

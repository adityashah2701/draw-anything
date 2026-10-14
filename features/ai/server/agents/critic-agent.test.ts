import { describe, expect, it } from "vitest";
import { criticAgent } from "@/features/ai/server/agents/critic-agent";
import type { AIWorkflowState } from "@/features/ai/server/agents/types";
import { normalizeModelGraphDraft, normalizeModelPlan } from "@/features/ai/schemas";
import { buildAIDiagramDocument } from "@/features/ai/server/validation";

const stateFor = (diagramType: string, graph: unknown): AIWorkflowState => {
  const plan = normalizeModelPlan({ diagramType, summary: "test" });
  const document = buildAIDiagramDocument({
    prompt: "test",
    plan,
    graph: normalizeModelGraphDraft(graph),
    provider: "gemini",
    modelName: "test",
    generationId: "gen",
    improvementPasses: 0,
  });
  return {
    request: { prompt: "test" },
    frame: { frameId: "f1", prompt: "test", provider: "gemini", status: "running", currentPhase: null, events: [], checkpoints: [], finalElementIds: [] },
    events: [],
    checkpoints: [],
    plan,
    document,
    improvementPasses: 0,
    expansionRound: 0,
    isComplete: false,
    missingComponents: [],
    requirements: [],
    actors: [],
    systems: [],
    infrastructure: [],
    nonFunctionalRequirements: [],
    trustBoundaries: [],
    communicationPaths: [],
    risks: [],
    toolResults: [],
    criticNotes: [],
  } as AIWorkflowState;
};

const chain = (labels: string[], kind = "generic") => ({
  nodes: labels.map((label, i) => ({ id: `n${i}`, label, kind })),
  edges: labels.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
});

const runtime = {} as never;

describe("criticAgent – completeness only applies to architecture diagrams", () => {
  it.each([
    ["flowchart", chain(["Start", "Enter credentials", "Valid?", "Dashboard", "Error"], "workflow")],
    ["mind-map", chain(["Topic", "Idea A", "Idea B", "Idea C"], "generic")],
    ["entity-relationship", chain(["User", "Order", "Product"], "generic")],
    ["sequence", chain(["Client", "Server", "Database"], "generic")],
  ])("does not ask a %s to add infrastructure layers", async (diagramType, graph) => {
    const update = await criticAgent(stateFor(diagramType, graph), runtime);
    expect(update.missingComponents).toEqual([]);
    expect(update.isComplete).toBe(true);
    const messages = (update.criticNotes ?? []).map((note) => note.message).join(" ");
    expect(messages).not.toMatch(/production architectures|layers:/i);
  });

  it("still asks an architecture diagram for missing layers (existing behaviour kept)", async () => {
    const update = await criticAgent(
      stateFor("architecture", chain(["Service A", "Service B", "Service C"], "service")),
      runtime,
    );
    expect(update.missingComponents!.length).toBeGreaterThan(0);
    expect(update.isComplete).toBe(false);
  });

  it("still reports structural problems for every diagram type", async () => {
    const update = await criticAgent(
      stateFor("flowchart", {
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" },
        ],
        edges: [{ from: "a", to: "b" }],
      }),
      runtime,
    );
    expect((update.criticNotes ?? []).some((note) => note.id === "critic-orphans")).toBe(true);
  });
});

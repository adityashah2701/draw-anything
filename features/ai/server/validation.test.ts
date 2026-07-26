import { describe, expect, it } from "vitest";
import {
  aiGraphDraftSchema,
  modelGraphDraftSchema,
  normalizeModelGraphDraft,
} from "@/features/ai/schemas";
import {
  buildAIDiagramDocument,
  sanitizeGraphDraft,
} from "@/features/ai/server/validation";

describe("AI graph validation", () => {
  it("repairs duplicate node ids and removes invalid edges", () => {
    const graph = aiGraphDraftSchema.parse({
      nodes: [
        { id: "api", label: "API", kind: "api" },
        { id: "api", label: "Database", kind: "database" },
      ],
      edges: [
        { from: "api", to: "missing" },
        { from: "api", to: "api" },
      ],
    });

    const repaired = sanitizeGraphDraft(graph);

    expect(repaired.nodes).toHaveLength(2);
    expect(new Set(repaired.nodes.map((node) => node.id)).size).toBe(2);
    expect(repaired.edges).toHaveLength(0);
    expect(repaired.duplicateIds).toBe(1);
    expect(repaired.invalidEdges).toBe(2);
  });

  it("builds a valid document from a minimal connected graph", () => {
    const graph = aiGraphDraftSchema.parse({
      nodes: [
        { id: "client", label: "Client", kind: "browser" },
        { id: "api", label: "API", kind: "api" },
      ],
      edges: [{ id: "calls", from: "client", to: "api" }],
    });

    const document = buildAIDiagramDocument({
      prompt: "Client calls API",
      plan: {
        diagramType: "architecture",
        summary: "Client calls an API",
        layoutStrategy: "layered",
        direction: "top-to-bottom",
        styleTheme: "technical",
        density: "balanced",
        requirements: [],
        actors: [],
        systems: [],
        nonFunctionalRequirements: [],
        risks: [],
      },
      graph,
      provider: "gemini",
      modelName: "test-model",
      generationId: "test-gen",
      improvementPasses: 0,
    });

    expect(document.schemaVersion).toBe("ai-diagram-v1");
    expect(document.validation.valid).toBe(true);
    expect(document.nodes[0].layer).toBe("edge");
    expect(document.requirements.length).toBeGreaterThan(0);
    expect(document.architecture).toHaveLength(2);
    expect(document.communicationProtocols).toHaveLength(1);
    expect(document.reasoningMetadata.requirementsSummary).toContain("Client calls API");
  });

  it("accepts model edges that omit optional style fields", () => {
    const graph = modelGraphDraftSchema.parse({
      nodes: [
        { id: "frontend", label: "Frontend", kind: "browser" },
        { id: "backend", label: "Backend", kind: "service" },
      ],
      edges: [{ from: "frontend", to: "backend", label: "API calls" }],
    });

    expect(graph.edges?.[0]).toMatchObject({
      from: "frontend",
      to: "backend",
      label: "API calls",
    });
  });

  it("normalizes unsupported model node kinds instead of failing", () => {
    const graph = normalizeModelGraphDraft({
      nodes: [
        { id: "frontend", label: "Frontend", kind: "frontend" },
        { id: "backend", label: "Backend", kind: "backend" },
      ],
      edges: [{ from: "frontend", to: "backend" }],
    });

    expect(graph.nodes.map((node) => node.kind)).toEqual(["generic", "generic"]);
    const document = buildAIDiagramDocument({
      prompt: "frontend backend architecture",
      plan: {
        diagramType: "architecture",
        summary: "Frontend talks to backend",
        layoutStrategy: "layered",
        direction: "top-to-bottom",
        styleTheme: "technical",
        density: "balanced",
        requirements: [],
        actors: [],
        systems: [],
        nonFunctionalRequirements: [],
        risks: [],
      },
      graph,
      provider: "gemini",
      modelName: "test-model",
      generationId: "test-gen",
      improvementPasses: 0,
    });

    expect(document.nodes.map((node) => node.kind)).toEqual(["browser", "service"]);
  });
});

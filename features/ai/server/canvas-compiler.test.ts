import { describe, expect, it } from "vitest";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { AIDiagramDocumentV1 } from "@/features/ai/types";

const document: AIDiagramDocumentV1 = {
  schemaVersion: "ai-diagram-v1",
  diagramType: "architecture",
  intent: {
    prompt: "API with database",
    summary: "API stores data in a database",
  },
  nodes: [
    {
      id: "api",
      label: "API",
      kind: "api",
      layer: "application",
      column: 0,
    },
    {
      id: "database",
      label: "Database",
      kind: "database",
      layer: "data",
      column: 0,
    },
  ],
  edges: [{ id: "stores", from: "api", to: "database" }],
  groups: [],
  requirements: [
    {
      id: "api-with-database",
      text: "API with database",
      priority: "must",
      source: "prompt",
    },
  ],
  architecture: [
    {
      id: "api",
      label: "API",
      responsibility: "Serve requests",
      kind: "api",
    },
    {
      id: "database",
      label: "Database",
      responsibility: "Store data",
      kind: "database",
    },
  ],
  containers: [],
  annotations: [],
  trustBoundaries: [],
  communicationProtocols: [
    {
      id: "stores",
      from: "api",
      to: "database",
      protocol: "SQL",
      pattern: "sync",
    },
  ],
  visualImportance: [
    { nodeId: "api", score: 8 },
    { nodeId: "database", score: 6 },
  ],
  layoutHints: { strategy: "layered", direction: "top-to-bottom" },
  styleHints: { theme: "technical", density: "balanced" },
  validation: {
    valid: true,
    repaired: false,
    issues: [],
    metrics: {
      nodeCount: 2,
      edgeCount: 1,
      groupCount: 0,
      disconnectedComponents: 1,
      duplicateIds: 0,
      invalidEdges: 0,
      overlapCount: 0,
      orphanNodes: 0,
      oversizedRows: 0,
      poorSpacing: 0,
    },
  },
  metadata: {
    generationId: "gen-test",
    createdAt: "2026-07-26T00:00:00.000Z",
    provider: "gemini",
    model: "test-model",
    improvementPasses: 0,
  },
  reasoningMetadata: {
    requirementsSummary: "API with database",
    architectureSummary: "API stores data in a database",
    risks: [],
    criticNotes: [],
    toolResults: [],
  },
};

describe("AI canvas compiler", () => {
  it("compiles semantic nodes and routed arrows", () => {
    const elements = compileAIDiagramToCanvas(document, "frame-test");

    expect(elements).toHaveLength(3);
    expect(elements.filter((element) => element.type === "semantic-node")).toHaveLength(2);
    expect(elements.find((element) => element.type === "arrow")).toMatchObject({
      startConnection: { elementId: "gen-test-api" },
      endConnection: { elementId: "gen-test-database" },
    });
    expect(elements.every((element) => element.points.length >= 2)).toBe(true);
  });
});

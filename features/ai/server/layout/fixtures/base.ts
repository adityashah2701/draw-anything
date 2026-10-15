import type { AIDiagramDocumentV1, AIDiagramEdge, AIDiagramGroup, AIDiagramNode, AIDiagramType } from "@/features/ai/types";

type FixtureNode = Pick<AIDiagramNode, "id" | "label" | "kind"> & Partial<AIDiagramNode>;

interface FixtureInput {
  id: string;
  diagramType: AIDiagramType;
  prompt: string;
  direction?: "left-to-right" | "top-to-bottom" | "radial";
  strategy?: AIDiagramDocumentV1["layoutHints"]["strategy"];
  nodes: FixtureNode[];
  edges: AIDiagramEdge[];
  groups?: AIDiagramGroup[];
}

/** A complete, valid ai-diagram-v1 document around the graph a fixture cares about. */
export const fixtureDocument = (input: FixtureInput): AIDiagramDocumentV1 => ({
  schemaVersion: "ai-diagram-v1",
  diagramType: input.diagramType,
  intent: { prompt: input.prompt, summary: input.prompt },
  nodes: input.nodes.map((node) => ({ layer: "application", ...node })),
  edges: input.edges.map((edge, index) => ({ id: `e${index}`, ...edge })),
  groups: input.groups ?? [],
  requirements: [{ id: "r1", text: input.prompt, priority: "must", source: "prompt" }],
  architecture: [],
  containers: [],
  annotations: [],
  trustBoundaries: [],
  communicationProtocols: [],
  visualImportance: [],
  layoutHints: { strategy: input.strategy ?? "layered", direction: input.direction ?? "top-to-bottom" },
  styleHints: { theme: "technical", density: "balanced" },
  validation: {
    valid: true,
    repaired: false,
    issues: [],
    metrics: {
      nodeCount: input.nodes.length,
      edgeCount: input.edges.length,
      groupCount: input.groups?.length ?? 0,
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
    generationId: `fixture-${input.id}`,
    createdAt: "2026-10-15T00:00:00.000Z",
    provider: "gemini",
    model: "fixture",
    improvementPasses: 0,
  },
  reasoningMetadata: {
    requirementsSummary: input.prompt,
    architectureSummary: input.prompt,
    risks: [],
    criticNotes: [],
    toolResults: [],
  },
});

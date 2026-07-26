import { modelGraphDraftSchema, normalizeModelGraphDraft } from "@/features/ai/schemas";
import { buildRelationshipMessages } from "@/features/ai/server/prompts";
import { callStructured, checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const relationshipAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.graph || !state.plan) throw new Error("Relationship agent needs a graph.");
  const frame = { ...state.frame, currentPhase: "relationshipAgent" as const };
  logAIPhase(frame.frameId, "relationshipAgent", "Resolving relationships");
  const messages = await buildRelationshipMessages(state.request, state.graph);
  const rawGraph = await callStructured<Record<string, unknown>>(
    runtime.model,
    modelGraphDraftSchema,
    "ai_relationship_graph",
    messages,
  );
  const graph = normalizeModelGraphDraft(rawGraph);
  return {
    frame,
    graph,
    communicationPaths: graph.edges.map((edge, index) => ({
      id: edge.id ?? `communication-${index + 1}`,
      from: edge.from,
      to: edge.to,
      protocol: edge.label?.match(/\b(sql|query|read|write)\b/i) ? "SQL" : "HTTPS",
      pattern: edge.relationship?.match(/\b(async|event|queue|stream)\b/i) ? "async" : "sync",
    })),
    events: [
      phaseStarted(frame.frameId, "relationshipAgent", "Resolving architecture relationships"),
      {
        type: "graph.delta",
        frameId: frame.frameId,
        phase: "relationshipAgent",
        graph: {
          diagramType: state.plan.diagramType,
          nodes: graph.nodes,
          edges: graph.edges,
          groups: graph.groups,
        },
      },
      phaseCompleted(frame.frameId, "relationshipAgent", `Resolved ${graph.edges.length} connectors`),
    ],
    checkpoints: [checkpoint("relationshipAgent", `Resolved ${graph.edges.length} connectors`)],
  };
};

import { aiGraphDraftSchema } from "@/features/ai/schemas";
import { expandInfrastructure } from "@/features/ai/server/tools/infrastructure-expander";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const infrastructureExpanderAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.graph || !state.plan) throw new Error("Cannot expand infrastructure without a graph.");
  const frame = { ...state.frame, currentPhase: "infrastructureExpander" as const };
  logAIPhase(frame.frameId, "infrastructureExpander", "Expanding deterministic production infrastructure");
  const expanded = expandInfrastructure(state.request, state.graph);
  const graph = aiGraphDraftSchema.parse({
    ...state.graph,
    nodes: expanded.graph.nodes,
    edges: expanded.graph.edges,
  });
  return {
    frame,
    graph,
    infrastructure: expanded.infrastructure,
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Infrastructure Expander",
        summary: `Added ${expanded.addedNodeIds.length} infrastructure nodes`,
        data: expanded.addedNodeIds,
      },
    ],
    events: [
      phaseStarted(frame.frameId, "infrastructureExpander", "Adding production infrastructure where relevant"),
      { type: "infrastructure.expanded", frameId: frame.frameId, addedNodeIds: expanded.addedNodeIds, infrastructure: expanded.infrastructure },
      phaseCompleted(frame.frameId, "infrastructureExpander", `Added ${expanded.addedNodeIds.length} infrastructure nodes`),
    ],
    checkpoints: [checkpoint("infrastructureExpander", `Added ${expanded.addedNodeIds.length} deterministic infrastructure nodes`)],
  };
};

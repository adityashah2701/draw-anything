import { deriveArchitectureComponents } from "@/features/ai/server/validation";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const diagramComposerAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.graph || !state.plan) throw new Error("Diagram composer needs a graph.");
  const frame = { ...state.frame, currentPhase: "diagramComposer" as const };
  logAIPhase(frame.frameId, "diagramComposer", "Composing diagram semantics");
  const architecture = deriveArchitectureComponents(state.graph.nodes);
  return {
    frame,
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Graph Analyzer",
        summary: `${state.graph.nodes.length} nodes and ${state.graph.edges.length} edges composed`,
      },
    ],
    events: [
      phaseStarted(frame.frameId, "diagramComposer", "Composing final semantic graph"),
      {
        type: "graph.delta",
        frameId: frame.frameId,
        phase: "diagramComposer",
        graph: {
          diagramType: state.plan.diagramType,
          nodes: state.graph.nodes,
          edges: state.graph.edges,
          groups: state.graph.groups,
        },
      },
      phaseCompleted(frame.frameId, "diagramComposer", `Composed ${architecture.length} architecture components`),
    ],
    checkpoints: [checkpoint("diagramComposer", "Composed semantic graph for layout")],
  };
};

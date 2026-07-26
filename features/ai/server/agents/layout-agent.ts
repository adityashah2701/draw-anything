import { aiGraphDraftSchema } from "@/features/ai/schemas";
import { assignStableColumns, chooseDeterministicLayout } from "@/features/ai/server/tools/layout-engine";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const layoutAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.graph || !state.plan) throw new Error("Layout agent needs a graph.");
  const frame = { ...state.frame, currentPhase: "layoutAgent" as const };
  logAIPhase(frame.frameId, "layoutAgent", "Applying deterministic layout hints");
  const graph = aiGraphDraftSchema.parse({
    ...state.graph,
    nodes: assignStableColumns(state.graph.nodes),
  });
  const layout = chooseDeterministicLayout(graph.nodes);
  return {
    frame,
    graph,
    plan: {
      ...state.plan,
      layoutStrategy: layout.strategy,
      direction: layout.direction,
    },
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Layout Engine",
        summary: `${layout.strategy} ${layout.direction} layout selected`,
      },
    ],
    events: [
      phaseStarted(frame.frameId, "layoutAgent", "Applying deterministic layout"),
      phaseCompleted(frame.frameId, "layoutAgent", "Layout hints prepared"),
    ],
    checkpoints: [checkpoint("layoutAgent", "Applied deterministic columns and layout hints")],
  };
};

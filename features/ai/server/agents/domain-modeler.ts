import { modelGraphDraftSchema, normalizeModelGraphDraft } from "@/features/ai/schemas";
import { buildDomainModelMessages } from "@/features/ai/server/prompts";
import { callStructured, checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const domainModelerAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.plan) throw new Error("Architecture planner did not produce a plan.");
  const frame = { ...state.frame, currentPhase: "domainModeler" as const };
  logAIPhase(frame.frameId, "domainModeler", "Creating semantic domain graph");
  const messages = await buildDomainModelMessages(state.request, {
    ...state.plan,
    requirements: state.requirements,
    actors: state.actors,
    systems: state.systems,
  });
  const rawGraph = await callStructured<Record<string, unknown>>(
    runtime.model,
    modelGraphDraftSchema,
    "ai_domain_graph",
    messages,
  );
  const graph = normalizeModelGraphDraft(rawGraph);
  return {
    frame,
    graph,
    events: [
      phaseStarted(frame.frameId, "domainModeler", "Modeling domain components"),
      ...graph.nodes.map((node) => ({ type: "node.created" as const, frameId: frame.frameId, node })),
      {
        type: "graph.delta" as const,
        frameId: frame.frameId,
        phase: "domainModeler" as const,
        graph: {
          diagramType: state.plan.diagramType,
          nodes: graph.nodes,
          edges: graph.edges,
          groups: graph.groups,
        },
      },
      phaseCompleted(frame.frameId, "domainModeler", `Modeled ${graph.nodes.length} semantic nodes`),
    ],
    checkpoints: [checkpoint("domainModeler", `Modeled ${graph.nodes.length} semantic nodes`)],
  };
};

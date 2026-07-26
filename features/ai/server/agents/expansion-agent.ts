import { modelGraphDraftSchema, normalizeModelGraphDraft } from "@/features/ai/schemas";
import { buildExpansionMessages } from "@/features/ai/server/prompts";
import { callStructured, checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const expansionAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.graph || !state.plan) throw new Error("Expansion agent needs a graph and plan.");
  if (!state.missingComponents || state.missingComponents.length === 0) {
    return {
      frame: state.frame,
      events: [
        phaseStarted(state.frame.frameId, "expansionAgent", "No expansion needed"),
        phaseCompleted(state.frame.frameId, "expansionAgent", "No missing components to expand"),
      ],
      checkpoints: [checkpoint("expansionAgent", "No expansion needed")],
    };
  }

  const frame = { ...state.frame, currentPhase: "expansionAgent" as const };
  const round = state.expansionRound + 1;
  logAIPhase(frame.frameId, "expansionAgent", `Expansion round ${round}: adding ${state.missingComponents.length} missing components`);

  const messages = await buildExpansionMessages(
    state.request,
    state.plan,
    state.graph,
    state.missingComponents,
    round,
  );

  const rawGraph = await callStructured<Record<string, unknown>>(
    runtime.model,
    modelGraphDraftSchema,
    `ai_expansion_round_${round}`,
    messages,
  );

  const graph = normalizeModelGraphDraft(rawGraph);
  const addedNodeIds = graph.nodes
    .filter((n) => !state.graph!.nodes.some((existing) => existing.id === n.id))
    .map((n) => n.id);

  return {
    frame,
    graph,
    expansionRound: round,
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Expansion Agent",
        summary: `Round ${round}: added ${addedNodeIds.length} nodes (${graph.nodes.length} total)`,
        data: { round, addedNodeIds, totalNodes: graph.nodes.length },
      },
    ],
    events: [
      phaseStarted(frame.frameId, "expansionAgent", `Expanding architecture (round ${round})`),
      ...graph.nodes
        .filter((n) => addedNodeIds.includes(n.id))
        .map((node) => ({ type: "node.created" as const, frameId: frame.frameId, node })),
      {
        type: "graph.delta" as const,
        frameId: frame.frameId,
        phase: "expansionAgent" as const,
        graph: {
          diagramType: state.plan!.diagramType,
          nodes: graph.nodes,
          edges: graph.edges,
          groups: graph.groups,
        },
      },
      phaseCompleted(
        frame.frameId,
        "expansionAgent",
        `Round ${round}: expanded to ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
      ),
    ],
    checkpoints: [checkpoint("expansionAgent", `Expansion round ${round}: ${graph.nodes.length} nodes total`)],
  };
};

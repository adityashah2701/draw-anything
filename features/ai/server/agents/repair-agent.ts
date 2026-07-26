import { modelGraphDraftSchema, normalizeModelGraphDraft } from "@/features/ai/schemas";
import { buildImprovementMessages } from "@/features/ai/server/prompts";
import { buildAIDiagramDocument } from "@/features/ai/server/validation";
import { getAIModelProviderConfig } from "@/features/ai/server/model-providers";
import { callStructured, checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

const needsRepair = (state: AIWorkflowState) =>
  Boolean(
    state.document &&
      (!state.document.validation.valid ||
        state.document.validation.metrics.orphanNodes > 0 ||
        state.document.nodes.length < 3),
  );

const needsExpansion = (state: AIWorkflowState) =>
  Boolean(
    state.missingComponents &&
      state.missingComponents.length > 0 &&
      !state.isComplete &&
      state.expansionRound < 3,
  );

export const repairAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.document || !state.plan) throw new Error("Repair agent needs a document.");
  const frame = { ...state.frame, currentPhase: "repairAgent" as const };
  logAIPhase(frame.frameId, "repairAgent", "Evaluating repair and expansion needs");

  if (!needsRepair(state) && !needsExpansion(state)) {
    return {
      frame,
      events: [
        phaseStarted(frame.frameId, "repairAgent", "Reviewing repair need"),
        phaseCompleted(frame.frameId, "repairAgent", "No additional repair or expansion required"),
      ],
      checkpoints: [checkpoint("repairAgent", "No further repair required")],
    };
  }

  const providerConfig = getAIModelProviderConfig(frame.provider);
  let graph = state.graph;
  let document = state.document;
  let improvementPasses = state.improvementPasses;
  const events: AIWorkflowUpdate["events"] = [
    phaseStarted(frame.frameId, "repairAgent", "Repairing and expanding diagram"),
  ];

  const maxPasses = needsExpansion(state) ? 3 : 2;

  while ((needsRepair({ ...state, document, improvementPasses }) || needsExpansion({ ...state, document, improvementPasses })) && improvementPasses < maxPasses) {
    const messages = await buildImprovementMessages(
      state.request,
      document,
      needsExpansion({ ...state, document, improvementPasses }) ? state.missingComponents : undefined,
    );
    const rawGraph = await callStructured<Record<string, unknown>>(
      runtime.model,
      modelGraphDraftSchema,
      `ai_repaired_graph_${improvementPasses + 1}`,
      messages,
    );
    graph = normalizeModelGraphDraft(rawGraph);
    improvementPasses += 1;
    document = buildAIDiagramDocument({
      prompt: state.request.prompt,
      plan: state.plan,
      graph,
      provider: frame.provider,
      modelName: providerConfig.modelName,
      generationId: runtime.createGenerationId(),
      improvementPasses,
      requirements: state.requirements,
      trustBoundaries: state.trustBoundaries,
      communicationProtocols: state.communicationPaths,
      risks: state.risks,
      criticNotes: state.criticNotes,
      toolResults: state.toolResults,
    });
    events.push(
      {
        type: "repair.applied",
        frameId: frame.frameId,
        pass: improvementPasses,
        summary: needsExpansion({ ...state, document, improvementPasses })
          ? `Expanded graph with missing components (pass ${improvementPasses})`
          : `Applied model-guided graph repair (pass ${improvementPasses})`,
      },
      {
        type: "graph.delta",
        frameId: frame.frameId,
        phase: "repairAgent",
        graph: {
          diagramType: document.diagramType,
          nodes: document.nodes,
          edges: document.edges,
          groups: document.groups,
        },
      },
      { type: "validation.report", frameId: frame.frameId, report: document.validation },
    );
  }

  events.push(phaseCompleted(
    frame.frameId,
    "repairAgent",
    `Completed ${improvementPasses} pass(es): ${document.nodes.length} nodes, ${document.edges.length} edges`,
  ));

  return {
    frame,
    graph,
    document,
    improvementPasses,
    events,
    checkpoints: [checkpoint("repairAgent", `Applied ${improvementPasses} repair/expansion pass(es)`)],
  };
};

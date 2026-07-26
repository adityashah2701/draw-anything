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

export const repairAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.document || !state.plan) throw new Error("Repair agent needs a document.");
  const frame = { ...state.frame, currentPhase: "repairAgent" as const };
  logAIPhase(frame.frameId, "repairAgent", "Evaluating repair pass");

  if (!needsRepair(state) || state.improvementPasses >= 2) {
    return {
      frame,
      events: [
        phaseStarted(frame.frameId, "repairAgent", "Reviewing repair need"),
        phaseCompleted(frame.frameId, "repairAgent", "No additional repair required"),
      ],
      checkpoints: [checkpoint("repairAgent", "No further repair required")],
    };
  }

  const providerConfig = getAIModelProviderConfig(frame.provider);
  let graph = state.graph;
  let document = state.document;
  let improvementPasses = state.improvementPasses;
  const events: AIWorkflowUpdate["events"] = [
    phaseStarted(frame.frameId, "repairAgent", "Repairing generated diagram"),
  ];

  while (needsRepair({ ...state, document, improvementPasses }) && improvementPasses < 2) {
    const messages = await buildImprovementMessages(state.request, document);
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
        summary: "Applied model-guided graph repair",
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

  events.push(phaseCompleted(frame.frameId, "repairAgent", "Repair pass completed"));

  return {
    frame,
    graph,
    document,
    improvementPasses,
    events,
    checkpoints: [checkpoint("repairAgent", "Applied repair pass")],
  };
};

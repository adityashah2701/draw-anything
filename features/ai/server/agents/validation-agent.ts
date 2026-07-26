import { getAIModelProviderConfig } from "@/features/ai/server/model-providers";
import { buildAIDiagramDocument } from "@/features/ai/server/validation";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AgentRuntime, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const validationAgent = async (
  state: AIWorkflowState,
  runtime: AgentRuntime,
): Promise<AIWorkflowUpdate> => {
  if (!state.plan || !state.graph) throw new Error("Cannot validate without a graph.");
  const frame = { ...state.frame, currentPhase: "validationAgent" as const };
  logAIPhase(frame.frameId, "validationAgent", "Validating diagram document");
  const providerConfig = getAIModelProviderConfig(frame.provider);
  const document = buildAIDiagramDocument({
    prompt: state.request.prompt,
    plan: state.plan,
    graph: state.graph,
    provider: frame.provider,
    modelName: providerConfig.modelName,
    generationId: runtime.createGenerationId(),
    improvementPasses: state.improvementPasses,
    requirements: state.requirements,
    trustBoundaries: state.trustBoundaries,
    communicationProtocols: state.communicationPaths,
    risks: state.risks,
    criticNotes: state.criticNotes,
    toolResults: state.toolResults,
  });
  return {
    frame,
    document,
    events: [
      phaseStarted(frame.frameId, "validationAgent", "Validating semantic graph"),
      { type: "validation.report", frameId: frame.frameId, report: document.validation },
      phaseCompleted(
        frame.frameId,
        "validationAgent",
        document.validation.valid ? "Validation passed" : "Validation found repairable issues",
      ),
    ],
    checkpoints: [checkpoint("validationAgent", "Validated semantic graph")],
  };
};

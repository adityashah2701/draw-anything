import { buildAIDiagramDocument } from "@/features/ai/server/validation";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { getAIModelProviderConfig } from "@/features/ai/server/model-providers";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const intermediateCompileAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.graph || !state.plan) {
    return {
      frame: state.frame,
      events: [],
      checkpoints: [],
    };
  }

  const frame = { ...state.frame, currentPhase: "diagramComposer" as const };
  logAIPhase(frame.frameId, "intermediateCompile", "Streaming intermediate elements to canvas");

  try {
    const providerConfig = getAIModelProviderConfig(frame.provider);
    const document = buildAIDiagramDocument({
      prompt: state.request.prompt,
      plan: state.plan,
      graph: state.graph,
      provider: frame.provider,
      modelName: providerConfig.modelName,
      generationId: `ai_intermediate_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      improvementPasses: state.improvementPasses,
      requirements: state.requirements,
      trustBoundaries: state.trustBoundaries,
      communicationProtocols: state.communicationPaths,
      risks: state.risks,
      criticNotes: state.criticNotes,
      toolResults: state.toolResults,
    });

    const elements = compileAIDiagramToCanvas(document, frame.frameId);

    return {
      frame,
      document,
      events: [
        phaseStarted(frame.frameId, "intermediateCompile", "Streaming intermediate diagram to canvas"),
        { type: "element.batch", frameId: frame.frameId, elements },
        phaseCompleted(
          frame.frameId,
          "intermediateCompile",
          `Streamed ${elements.length} elements (${state.graph.nodes.length} nodes, ${state.graph.edges.length} edges)`,
        ),
      ],
      checkpoints: [checkpoint("intermediateCompile", `Streamed ${elements.length} intermediate elements`)],
    };
  } catch (error) {
    console.error("[intermediateCompile] Failed to compile intermediate elements:", error);
    return {
      frame,
      events: [
        phaseStarted(frame.frameId, "intermediateCompile", "Intermediate compile skipped"),
        phaseCompleted(frame.frameId, "intermediateCompile", "Intermediate compile failed, continuing"),
      ],
      checkpoints: [checkpoint("intermediateCompile", "Intermediate compile failed, continuing")],
    };
  }
};

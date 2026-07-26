import { retrieveAIContext } from "@/features/ai/server/tools/context-retriever";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const contextRetrieverAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  const frame = {
    ...state.frame,
    status: "running" as const,
    currentPhase: "contextRetriever" as const,
  };
  logAIPhase(frame.frameId, "contextRetriever", "Loading canvas, registry, and memory context");
  const context = await retrieveAIContext(state.request);
  return {
    frame,
    memoryContext: context.memory,
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Context Retriever",
        summary: `${context.canvas.elementCount} canvas elements, ${context.registry.semanticKinds.length} semantic kinds`,
        data: context,
      },
    ],
    events: [
      {
        type: "frame.created",
        frame: {
          frameId: frame.frameId,
          whiteboardId: frame.whiteboardId,
          prompt: frame.prompt,
          provider: frame.provider,
          status: frame.status,
        },
      },
      phaseStarted(frame.frameId, "contextRetriever", "Retrieving canvas and memory context"),
      { type: "memory.loaded", frameId: frame.frameId, memory: context.memory },
      phaseCompleted(frame.frameId, "contextRetriever", "Context ready"),
    ],
    checkpoints: [checkpoint("contextRetriever", "Loaded canvas summary, memory fallback, and shape registry")],
  };
};

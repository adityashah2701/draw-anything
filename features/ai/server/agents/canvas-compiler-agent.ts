import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const canvasCompilerAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.document) throw new Error("Cannot compile without a document.");
  const frame = { ...state.frame, currentPhase: "canvasCompiler" as const };
  logAIPhase(frame.frameId, "canvasCompiler", "Compiling diagram to canvas");
  if (!state.document.validation.valid) {
    throw new Error("AI diagram validation failed.");
  }
  const elements = compileAIDiagramToCanvas(state.document, frame.frameId);
  const completedFrame = {
    ...frame,
    status: "completed" as const,
    currentPhase: "canvasCompiler" as const,
    finalGraph: state.document,
    finalElementIds: elements.map((element) => element.id),
  };
  return {
    frame: completedFrame,
    elements,
    events: [
      phaseStarted(frame.frameId, "canvasCompiler", "Compiling to canvas elements"),
      { type: "element.batch", frameId: frame.frameId, elements },
      phaseCompleted(frame.frameId, "canvasCompiler", `Compiled ${elements.length} canvas elements`),
      {
        type: "frame.done",
        frameId: frame.frameId,
        count: elements.length,
        graph: state.document,
      },
    ],
    checkpoints: [checkpoint("canvasCompiler", `Compiled ${elements.length} canvas elements`)],
  };
};

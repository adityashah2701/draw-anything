import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export const canvasCompilerAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.document) throw new Error("Cannot compile without a document.");
  const frame = { ...state.frame, currentPhase: "canvasCompiler" as const };
  logAIPhase(frame.frameId, "canvasCompiler", "Compiling diagram to canvas");

  let elements: DrawingElement[] = [];
  try {
    const compiled = compileAIDiagramDetailed(state.document, frame.frameId);
    elements = compiled.elements;
    const { collidingLabels, droppedGroups, unfittedNodes, layoutFallback } = compiled.diagnostics;
    if (layoutFallback || collidingLabels.length > 0 || droppedGroups.length > 0 || unfittedNodes.length > 0) {
      // Ids and counts only: nothing from the user's prompt is logged.
      console.warn(
        `[canvasCompiler] ${frame.frameId}: layoutFallback=${Boolean(layoutFallback)} collidingLabels=${collidingLabels.length} droppedGroups=${droppedGroups.length} unfittedNodes=${unfittedNodes.length}`,
      );
    }
  } catch (compileError) {
    console.error("[canvasCompiler] Compilation failed:", compileError);
  }

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

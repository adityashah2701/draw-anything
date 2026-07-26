import { AICriticNote } from "@/features/ai/types";
import { analyzeDiagram } from "@/features/ai/server/tools/diagram-analyzer";
import { checkpoint, logAIPhase, phaseCompleted, phaseStarted, AIWorkflowState, AIWorkflowUpdate } from "@/features/ai/server/agents/types";

export const criticAgent = async (
  state: AIWorkflowState,
): Promise<AIWorkflowUpdate> => {
  if (!state.document) throw new Error("Critic agent needs a document.");
  const frame = { ...state.frame, currentPhase: "criticAgent" as const };
  logAIPhase(frame.frameId, "criticAgent", "Critiquing architecture graph");
  const analysis = analyzeDiagram(state.document);
  const notes: AICriticNote[] = [
    ...state.document.validation.issues.map((issue, index) => ({
      id: `validation-note-${index + 1}`,
      severity: issue.severity,
      message: issue.message,
      targetId: issue.targetId,
    })),
  ];
  if (analysis.graph.orphanNodeIds.length > 0) {
    notes.push({
      id: "critic-orphans",
      severity: "warning",
      message: `${analysis.graph.orphanNodeIds.length} orphan nodes should be connected or removed.`,
    });
  }
  if (state.document.nodes.length < 3) {
    notes.push({
      id: "critic-too-small",
      severity: "warning",
      message: "Architecture diagrams should usually include at least three meaningful components.",
    });
  }
  return {
    frame,
    criticNotes: notes,
    toolResults: [
      ...state.toolResults,
      {
        toolName: "Diagram Analyzer",
        summary: `${notes.length} critic notes generated`,
        data: analysis,
      },
    ],
    events: [
      phaseStarted(frame.frameId, "criticAgent", "Reviewing generated architecture"),
      { type: "critic.report", frameId: frame.frameId, notes },
      phaseCompleted(frame.frameId, "criticAgent", notes.length > 0 ? "Critic notes recorded" : "Critic passed"),
    ],
    checkpoints: [checkpoint("criticAgent", `${notes.length} critic notes recorded`)],
  };
};

import { BaseMessageLike } from "@langchain/core/messages";
import {
  AICriticNote,
  AIDiagramDocumentV1,
  AIFrame,
  AIFrameCheckpoint,
  AIGenerateDiagramRequest,
  AIMemoryContext,
  AIRequirement,
  AIStreamEvent,
  AIToolResult,
  AITrustBoundary,
  AICommunicationProtocol,
  AIWorkflowPhase,
} from "@/features/ai/types";
import {
  AIGraphDraftOutput,
  AIPlanOutput,
} from "@/features/ai/schemas";
import { StructuredChatModel } from "@/features/ai/server/model-providers";
import { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export interface AIWorkflowState {
  request: AIGenerateDiagramRequest;
  frame: AIFrame;
  events: AIStreamEvent[];
  checkpoints: AIFrameCheckpoint[];
  plan?: AIPlanOutput;
  graph?: AIGraphDraftOutput;
  document?: AIDiagramDocumentV1;
  elements?: DrawingElement[];
  improvementPasses: number;
  requirements: AIRequirement[];
  actors: string[];
  systems: string[];
  infrastructure: string[];
  nonFunctionalRequirements: string[];
  trustBoundaries: AITrustBoundary[];
  communicationPaths: AICommunicationProtocol[];
  risks: string[];
  memoryContext?: AIMemoryContext;
  toolResults: AIToolResult[];
  criticNotes: AICriticNote[];
}

export type AIWorkflowUpdate = Partial<AIWorkflowState>;

export interface AgentRuntime {
  model: StructuredChatModel;
  createGenerationId: () => string;
}

export const phaseStarted = (
  frameId: string,
  phase: AIWorkflowPhase,
  message: string,
): AIStreamEvent => ({ type: "phase.started", frameId, phase, message });

export const phaseCompleted = (
  frameId: string,
  phase: AIWorkflowPhase,
  message: string,
): AIStreamEvent => ({ type: "phase.completed", frameId, phase, message });

export const checkpoint = (
  phase: AIWorkflowPhase,
  summary: string,
): AIFrameCheckpoint => ({
  phase,
  summary,
  at: new Date().toISOString(),
});

export const logAIPhase = (
  frameId: string,
  phase: AIWorkflowPhase,
  message: string,
  data?: unknown,
) => {
  if (process.env.NODE_ENV === "test") return;
  console.info("[ai.workflow]", {
    frameId,
    phase,
    message,
    data,
  });
};

export const callStructured = async <T extends Record<string, unknown>>(
  model: StructuredChatModel,
  schema: unknown,
  name: string,
  messages: BaseMessageLike[],
): Promise<T> => {
  const runnable = model.withStructuredOutput<T>(schema as never, { name });
  return runnable.invoke(messages as never);
};

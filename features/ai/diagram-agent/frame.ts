import { DEFAULT_AI_PROVIDER } from "@/features/ai/default-provider";
import type {
  AIFrame,
  AIGenerateDiagramRequest,
  AIStreamEvent,
  AIWorkflowPhase,
} from "@/features/ai/types";

const createFrameId = () => `ai_frame_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

export const createInitialAIFrame = (request: AIGenerateDiagramRequest): AIFrame => ({
  frameId: createFrameId(),
  whiteboardId: request.whiteboardId,
  prompt: request.prompt,
  provider: request.provider ?? request.model ?? DEFAULT_AI_PROVIDER,
  status: "queued",
  currentPhase: null,
  events: [],
  checkpoints: [],
  finalElementIds: [],
});

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

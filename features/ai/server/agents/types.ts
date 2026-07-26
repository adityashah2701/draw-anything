import { BaseMessageLike } from "@langchain/core/messages";
import {
  AICriticNote,
  AIDiagramDocumentV1,
  AIFrame,
  AIFrameCheckpoint,
  AIGenerateDiagramRequest,
  AIMemoryContext,
  AIMissingComponent,
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
import { withRetry, categorizeError } from "@/features/ai/server/retry";
import { SchemaValidationError } from "@/features/ai/server/errors";
import { createCorrelationId, createTimer, logAICall } from "@/features/ai/server/telemetry";

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
  expansionRound: number;
  isComplete: boolean;
  missingComponents: AIMissingComponent[];
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

const extractJsonFromText = (text: string): Record<string, unknown> | null => {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const raw = codeBlockMatch ? codeBlockMatch[1] : text;

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const callStructured = async <T extends Record<string, unknown>>(
  model: StructuredChatModel,
  schema: unknown,
  name: string,
  messages: BaseMessageLike[],
): Promise<T> => {
  const correlationId = createCorrelationId();
  const timer = createTimer();
  let retryCount = 0;

  try {
    const result = await withRetry(
      async () => {
        const runnable = model.withStructuredOutput<T>(schema as never);
        return await runnable.invoke(messages as never);
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1500,
        onRetry: (attempt) => {
          retryCount = attempt;
        },
      },
    );

    logAICall({
      correlationId,
      agent: name,
      latencyMs: timer(),
      retryCount,
      finishReason: "success",
    });

    return result;
  } catch (rawError) {
    const categorized = categorizeError(rawError);

    // Attempt JSON extraction fallback for parse failures
    const isParseFailure =
      rawError instanceof Error &&
      (rawError.message.includes("Failed to parse") ||
       rawError.message.includes("tool call") ||
       rawError.message.includes("JSON"));

    if (isParseFailure) {
      console.warn(`[callStructured] Parse failure for "${name}", attempting JSON extraction fallback`);

      try {
        const response = await model.invoke(messages as never);
        const rawText =
          typeof response === "string"
            ? response
            : typeof response?.content === "string"
              ? response.content
              : Array.isArray(response?.content)
                ? response.content
                    .map((block: { type?: string; text?: string }) =>
                      block?.type === "text" ? block.text : "",
                    )
                    .join("")
                : "";

        const extracted = extractJsonFromText(rawText);
        if (extracted) {
          logAICall({
            correlationId,
            agent: name,
            latencyMs: timer(),
            retryCount,
            finishReason: "success",
          });
          return extracted as T;
        }
      } catch (fallbackError) {
        logAICall({
          correlationId,
          agent: name,
          latencyMs: timer(),
          retryCount,
          finishReason: "error",
          errorMessage: `JSON fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        });
        throw new SchemaValidationError(name, rawError);
      }

      logAICall({
        correlationId,
        agent: name,
        latencyMs: timer(),
        retryCount,
        finishReason: "error",
        errorMessage: "JSON extraction returned no valid object",
      });
      throw new SchemaValidationError(name, rawError);
    }

    logAICall({
      correlationId,
      agent: name,
      latencyMs: timer(),
      retryCount,
      finishReason: "error",
      errorMessage: categorized.message,
    });

    throw categorized;
  }
};

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
import { extractJsonFromText } from "@/features/ai/server/json-extract";

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

const describeNormalizationError = (error: unknown): string => {
  const issues = (error as { issues?: Array<{ path?: unknown[]; message?: string }> })?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .slice(0, 3)
      .map((issue) => `${(issue.path ?? []).join(".") || "(root)"}: ${issue.message ?? "invalid"}`)
      .join("; ");
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
};

/**
 * `callStructured` + normalisation, with one corrective re-ask.
 *
 * Providers can return JSON that parses but is unusable (no nodes, wrong
 * shape). Instead of failing the whole generation, show the model its own
 * answer and the problem once, then give up with a typed error.
 */
export const callStructuredNormalized = async <T extends Record<string, unknown>, N>(
  model: StructuredChatModel,
  schema: unknown,
  name: string,
  messages: BaseMessageLike[],
  normalize: (raw: T) => N,
  { maxReasks = 1 }: { maxReasks?: number } = {},
): Promise<N> => {
  let lastError: unknown;
  let current = messages;

  for (let attempt = 0; attempt <= maxReasks; attempt += 1) {
    const raw = await callStructured<T>(model, schema, name, current);
    try {
      return normalize(raw);
    } catch (error) {
      lastError = error;
      if (attempt === maxReasks) break;
      console.warn(`[callStructuredNormalized] "${name}" output unusable, re-asking once:`, describeNormalizationError(error));
      current = [
        ...messages,
        ["ai", JSON.stringify(raw).slice(0, 4_000)],
        [
          "human",
          `That answer could not be used: ${describeNormalizationError(error)}. Reply again with the corrected JSON object only.`,
        ],
      ];
    }
  }
  throw new SchemaValidationError(name, lastError);
};

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
import {
  SchemaValidationError,
  UnparseableModelOutputError,
} from "@/features/ai/server/errors";
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

const callStructured = async <T extends Record<string, unknown>>(
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

    logAICall({
      correlationId,
      agent: name,
      latencyMs: timer(),
      retryCount,
      finishReason: "error",
      errorMessage: categorized.message,
    });

    if (categorized instanceof UnparseableModelOutputError) {
      // Show what the model actually said, so a bad generation can be diagnosed
      // from the server log instead of guessed at.
      console.warn(
        `[callStructured] "${name}" gave no readable JSON (${categorized.reason}):`,
        categorized.rawText.slice(0, 400) || "(empty)",
      );
      throw new SchemaValidationError(name, categorized);
    }
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
 * `callStructured` + normalisation, with corrective re-asks.
 *
 * Providers sometimes answer with something unusable: text that is not JSON, an
 * empty reply, or JSON with no nodes. Instead of failing the whole generation,
 * show the model its own answer and what was wrong, once (`maxReasks`), then
 * give up with a typed error.
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
    const reask = (previous: string, problem: string): BaseMessageLike[] => [
      ...messages,
      ...(previous ? ([["ai", previous.slice(0, 4_000)]] as BaseMessageLike[]) : []),
      ["human", `${problem} Reply again with the corrected JSON object only.`],
    ];

    let raw: T;
    try {
      raw = await callStructured<T>(model, schema, name, current);
    } catch (error) {
      lastError = error;
      const unreadable =
        error instanceof SchemaValidationError &&
        error.cause instanceof UnparseableModelOutputError
          ? error.cause
          : null;
      if (!unreadable || attempt === maxReasks) throw error;
      console.warn(`[callStructuredNormalized] "${name}" reply unreadable (${unreadable.reason}), re-asking once`);
      current = reask(
        unreadable.reason === "truncated" ? "" : unreadable.rawText,
        unreadable.reason === "truncated"
          ? "Your previous answer was cut off. Make it shorter: fewer nodes, brief labels."
          : "That answer was not a single valid JSON object.",
      );
      continue;
    }

    try {
      return normalize(raw);
    } catch (error) {
      lastError = error;
      if (attempt === maxReasks) break;
      console.warn(`[callStructuredNormalized] "${name}" output unusable, re-asking once:`, describeNormalizationError(error));
      current = reask(
        JSON.stringify(raw),
        `That answer could not be used: ${describeNormalizationError(error)}.`,
      );
    }
  }
  throw new SchemaValidationError(name, lastError);
};

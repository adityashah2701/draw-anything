/**
 * Lightweight structured telemetry for AI calls.
 * Logs correlation ID, agent, model, latency, token estimates, retry count.
 * No external dependencies — structured console output only.
 */

let correlationCounter = 0;

export const createCorrelationId = (): string => {
  correlationCounter += 1;
  return `ai_${Date.now()}_${correlationCounter}`;
};

export interface AILogEntry {
  correlationId: string;
  agent: string;
  model?: string;
  provider?: string;
  phase?: string;
  latencyMs: number;
  inputTokensEstimate?: number;
  outputTokensEstimate?: number;
  retryCount: number;
  finishReason: "success" | "error" | "timeout";
  errorMessage?: string;
  timestamp: string;
}

/**
 * Log an AI call result. Structured JSON for easy parsing.
 */
export const logAICall = (entry: Omit<AILogEntry, "timestamp">): void => {
  if (process.env.NODE_ENV === "test") return;

  const full: AILogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  if (entry.finishReason === "error") {
    console.warn("[ai.telemetry]", JSON.stringify(full));
  } else {
    console.info("[ai.telemetry]", JSON.stringify(full));
  }
};

/**
 * Simple timer for measuring AI call latency.
 */
export const createTimer = () => {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
};

/**
 * Estimate token count from text (rough: ~4 chars per token).
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 4);

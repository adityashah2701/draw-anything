import type { AgentMessage, ModelTurn, ToolTransport } from "../types";

export interface FallbackNotice {
  from: ToolTransport["kind"];
  to: ToolTransport["kind"];
  reason: string;
}

const isAbort = (error: unknown) => error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
/** Rate limits and outages are the same on either transport: switching would not help. */
const isTransient = (error: unknown) =>
  error instanceof Error && (/429|rate.?limit|quota|timeout|timed out|ECONN|ENOTFOUND|network|50[0-4]/i.test(error.message) || error.name === "RateLimitError");

/**
 * Uses `primary` until it fails in a way that looks like "this model/endpoint does not do tool
 * calling" (e.g. a 400 about `tools`), then switches to `secondary` for the rest of the run.
 * Aborts and transient errors are re-thrown untouched.
 */
export const createFallbackTransport = (
  primary: ToolTransport,
  secondary: ToolTransport,
  onFallback?: (notice: FallbackNotice) => void,
): ToolTransport => {
  let active = primary;
  return {
    get kind() {
      return active.kind;
    },
    async complete(messages: readonly AgentMessage[], options): Promise<ModelTurn> {
      if (active === secondary) return secondary.complete(messages, options);
      try {
        return await primary.complete(messages, options);
      } catch (error) {
        if (isAbort(error) || isTransient(error)) throw error;
        onFallback?.({ from: primary.kind, to: secondary.kind, reason: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
        active = secondary;
        return secondary.complete(messages, options);
      }
    },
  };
};

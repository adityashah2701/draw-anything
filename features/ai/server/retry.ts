import { RateLimitError, QuotaExceededError, NetworkError, AIServiceError } from "./errors";

const RATE_LIMIT_SIGNALS = [
  "rate_limit_exceeded",
  "tokens per minute",
  "tpm",
  "request too large",
  "429",
  "413",
];

const QUOTA_SIGNALS = ["quota", "quota exceeded", "billing"];

/** Limits that reset hours from now, not seconds: waiting and retrying cannot help (Groq: "tokens per day (TPD)"). */
const DAILY_SIGNALS = ["per day", "(tpd)", "(rpd)", "daily", "exceeded your current quota"];
const isDailyLimit = (msg: string): boolean => DAILY_SIGNALS.some((s) => msg.includes(s));

const NETWORK_SIGNALS = [
  "econnrefused",
  "econnreset",
  "enotfound",
  "etimedout",
  "fetch failed",
  "network",
  "deadline exceeded",
  // Gemini 503 UNAVAILABLE ("high demand") and 500/504 are transient per its docs.
  "503",
  "unavailable",
  "high demand",
  "overloaded",
];

const isRateLimit = (msg: string): boolean =>
  RATE_LIMIT_SIGNALS.some((s) => msg.includes(s));

const isQuota = (msg: string): boolean =>
  QUOTA_SIGNALS.some((s) => msg.includes(s));

const isNetwork = (msg: string): boolean =>
  NETWORK_SIGNALS.some((s) => msg.includes(s));

/**
 * How long the provider asked us to wait ("Please try again in 7.605s", "try again in 450ms", Groq and
 * OpenAI style), in ms, or undefined when the message says nothing about it.
 */
export const retryAfterMs = (message: string): number | undefined => {
  const m = /try again in\s+(?:(\d+(?:\.\d+)?)\s*m(?!s)\s*)?(?:(\d+(?:\.\d+)?)\s*(ms|s))?/i.exec(message);
  if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
  const minutes = m[1] === undefined ? 0 : Number(m[1]) * 60_000;
  const rest = m[2] === undefined ? 0 : Number(m[2]) * (m[3].toLowerCase() === "ms" ? 1 : 1000);
  return Math.round(minutes + rest);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const jitter = (base: number): number =>
  base + Math.random() * base * 0.3;

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1500,
  maxDelayMs: 30000,
};

/**
 * Categorize a raw error into a typed AI error.
 */
export const categorizeError = (error: unknown): AIServiceError => {
  // Already typed: keep it. (Matching its message against the signals below
  // would misread e.g. "... (413 chars)" as an HTTP 413.)
  if (error instanceof AIServiceError) return error;

  const msg = error instanceof Error ? error.message : String(error);

  if (isDailyLimit(msg.toLowerCase())) return new QuotaExceededError(msg, error);
  if (isRateLimit(msg)) return new RateLimitError(msg, error);
  if (isQuota(msg)) return new QuotaExceededError(msg, error);
  if (isNetwork(msg)) return new NetworkError(msg, error);

  return new AIServiceError(msg, "UNKNOWN_ERROR", error);
};

/**
 * Wrap an async function with retry logic, exponential backoff, and jitter.
 * Categorizes errors and only retries on transient failures.
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> => {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (rawError) {
      lastError = categorizeError(rawError);

      // Don't retry quota or auth errors
      if (
        lastError instanceof QuotaExceededError ||
        (lastError instanceof AIServiceError &&
          lastError.code === "AUTHENTICATION_FAILED")
      ) {
        throw lastError;
      }

      // Only retry rate limit and network errors
      const isRetryable =
        lastError instanceof RateLimitError || lastError instanceof NetworkError;

      if (!isRetryable || attempt >= opts.maxAttempts - 1) {
        throw lastError;
      }

      const errText = lastError instanceof Error ? lastError.message : String(lastError);
      const asked = lastError instanceof RateLimitError ? retryAfterMs(errText) : undefined;
      // The provider's own "try again in Ns" beats a guess; a little extra covers its rounding.
      const delay = Math.min(
        asked !== undefined ? asked + 500 : jitter(opts.baseDelayMs * Math.pow(2, attempt)),
        opts.maxDelayMs,
      );

      opts.onRetry?.(attempt + 1, lastError, delay);
      const errMessage = lastError instanceof Error ? lastError.message : String(lastError);
      console.warn(
        `[retry] Attempt ${attempt + 1}/${opts.maxAttempts} failed: ${errMessage}. Retrying in ${Math.round(delay)}ms...`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
};

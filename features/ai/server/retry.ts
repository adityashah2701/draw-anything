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

const NETWORK_SIGNALS = [
  "econnrefused",
  "econnreset",
  "enotfound",
  "etimedout",
  "fetch failed",
  "network",
  "deadline exceeded",
];

const isRateLimit = (msg: string): boolean =>
  RATE_LIMIT_SIGNALS.some((s) => msg.includes(s));

const isQuota = (msg: string): boolean =>
  QUOTA_SIGNALS.some((s) => msg.includes(s));

const isNetwork = (msg: string): boolean =>
  NETWORK_SIGNALS.some((s) => msg.includes(s));

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
  const msg = error instanceof Error ? error.message : String(error);

  if (isRateLimit(msg)) return new RateLimitError(msg, error);
  if (isQuota(msg)) return new QuotaExceededError(msg, error);
  if (isNetwork(msg)) return new NetworkError(msg, error);

  return error instanceof AIServiceError
    ? error
    : new AIServiceError(msg, "UNKNOWN_ERROR", error);
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

      const delay = Math.min(
        jitter(opts.baseDelayMs * Math.pow(2, attempt)),
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

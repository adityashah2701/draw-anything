import { describe, expect, it } from "vitest";
import { categorizeError } from "@/features/ai/server/retry";
import {
  AIServiceError,
  NetworkError,
  QuotaExceededError,
  RateLimitError,
  UnparseableModelOutputError,
} from "@/features/ai/server/errors";

describe("categorizeError", () => {
  it("keeps typed errors as they are, whatever digits their message contains", () => {
    const unreadable = new UnparseableModelOutputError("not-json", "x");
    expect(categorizeError(unreadable)).toBe(unreadable);
    const odd = new AIServiceError("failed after 413 chars at 429 ms, tpm network quota", "X");
    expect(categorizeError(odd)).toBe(odd);
  });

  it("classifies untyped provider errors by their message", () => {
    expect(categorizeError(new Error("Request too large for model on tokens per minute (TPM)"))).toBeInstanceOf(RateLimitError);
    expect(categorizeError(new Error("429 rate_limit_exceeded"))).toBeInstanceOf(RateLimitError);
    expect(categorizeError(new Error("You exceeded your current quota"))).toBeInstanceOf(QuotaExceededError);
    expect(categorizeError(new Error("fetch failed ECONNRESET"))).toBeInstanceOf(NetworkError);
    const other = categorizeError(new Error("something else"));
    expect(other.code).toBe("UNKNOWN_ERROR");
    expect(other.cause).toBeInstanceOf(Error);
  });
});

describe("daily limits are not retried", () => {
  it("treats a tokens-per-day or exhausted-quota error as quota, but a per-minute limit as a rate limit", async () => {
    const { categorizeError } = await import("./retry");
    const { QuotaExceededError, RateLimitError } = await import("./errors");
    const tpd = '429 {"error":{"message":"Rate limit reached for model x on tokens per day (TPD): Limit 200000, Used 198992. Please try again in 14m27s."}}';
    const tpm = '429 {"error":{"message":"Rate limit reached for model x on tokens per minute (TPM): Limit 8000, Used 6188. Please try again in 3s."}}';
    const gemini = '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}';
    expect(categorizeError(new Error(tpd))).toBeInstanceOf(QuotaExceededError);
    expect(categorizeError(new Error(gemini))).toBeInstanceOf(QuotaExceededError);
    expect(categorizeError(new Error(tpm))).toBeInstanceOf(RateLimitError);
  });
});

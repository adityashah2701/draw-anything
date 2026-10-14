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

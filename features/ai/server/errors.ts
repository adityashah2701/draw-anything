/**
 * Typed AI service errors. Agents and callers can catch specific error types
 * instead of parsing raw SDK error messages.
 */

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIServiceError";
  }
}

export class RateLimitError extends AIServiceError {
  constructor(message = "AI provider rate limit exceeded", cause?: unknown) {
    super(message, "RATE_LIMIT_EXCEEDED", cause);
    this.name = "RateLimitError";
  }
}

export class QuotaExceededError extends AIServiceError {
  constructor(message = "AI provider quota exceeded", cause?: unknown) {
    super(message, "QUOTA_EXCEEDED", cause);
    this.name = "QuotaExceededError";
  }
}

export class ModelUnavailableError extends AIServiceError {
  constructor(model: string, cause?: unknown) {
    super(`Model "${model}" is unavailable`, "MODEL_UNAVAILABLE", cause);
    this.name = "ModelUnavailableError";
  }
}

export class SchemaValidationError extends AIServiceError {
  constructor(agentName: string, cause?: unknown) {
    super(
      `Model "${agentName}" failed to produce valid structured output`,
      "SCHEMA_VALIDATION_FAILED",
      cause,
    );
    this.name = "SchemaValidationError";
  }
}

export class AuthenticationError extends AIServiceError {
  constructor(provider: string, cause?: unknown) {
    super(
      `Authentication failed for provider "${provider}"`,
      "AUTHENTICATION_FAILED",
      cause,
    );
    this.name = "AuthenticationError";
  }
}

export class NetworkError extends AIServiceError {
  constructor(message = "Network request failed", cause?: unknown) {
    super(message, "NETWORK_ERROR", cause);
    this.name = "NetworkError";
  }
}

/**
 * Map an unknown error to a user-facing string.
 */
export const toUserFacingMessage = (error: unknown): string => {
  if (error instanceof RateLimitError) {
    return "AI provider token limit exceeded. Try a simpler prompt or switch providers.";
  }
  if (error instanceof QuotaExceededError) {
    return "AI provider quota exhausted. Please try again later or switch providers.";
  }
  if (error instanceof AuthenticationError) {
    return "AI provider authentication failed. Check your API key configuration.";
  }
  if (error instanceof ModelUnavailableError) {
    return "Selected AI model is currently unavailable. Try a different provider.";
  }
  if (error instanceof SchemaValidationError) {
    return "AI returned an invalid response. Please try again.";
  }
  if (error instanceof NetworkError) {
    return "Network error connecting to AI provider. Please check your connection.";
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  if (
    message.includes("rate limit") ||
    message.includes("tokens per minute") ||
    message.includes("Request too large") ||
    message.includes("TPM")
  ) {
    return "AI provider token limit exceeded. Try a simpler prompt or switch providers.";
  }

  if (
    message.includes("tool call validation failed") ||
    message.includes("parameters for tool") ||
    message.includes("failed_generation")
  ) {
    return "AI provider returned a malformed response. Please try again.";
  }

  return message.length > 260 ? "AI generation failed. Please try again." : message;
};

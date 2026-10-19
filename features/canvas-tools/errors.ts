/**
 * Why a tool call did not do what was asked. The code is for programs (and tests), the message is written
 * for the model: it says what is wrong and what to do next, and `ids` names the offending elements.
 */
export type ToolErrorCode =
  | "unknown_tool"
  | "tool_not_enabled"
  | "invalid_arguments"
  | "not_found"
  | "locked"
  | "conflict"
  | "unsupported"
  | "invalid_state"
  | "limit_exceeded"
  | "stale_document"
  | "read_only"
  | "unavailable"
  | "confirmation_required"
  | "confirmation_denied"
  | "skipped"
  | "cancelled"
  | "execution_failed";

export interface ToolErrorInfo {
  code: ToolErrorCode;
  message: string;
  /** Elements the problem is about, when it is about elements. */
  ids?: string[];
  /** Anything else that helps the caller recover (the current revision, the allowed values...). */
  details?: Record<string, unknown>;
}

/** Thrown by a tool body; the executor turns it into a structured failure and applies nothing. */
export class ToolError extends Error {
  readonly info: ToolErrorInfo;
  constructor(code: ToolErrorCode, message: string, extra: { ids?: string[]; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "ToolError";
    this.info = { code, message, ...extra };
  }
}

export const isToolError = (value: unknown): value is ToolError => value instanceof ToolError;

import type { ToolResult } from "../types";

/** The most characters of one tool result the model sees; the rest is summarised, never silently cut mid-structure. */
export const MAX_RESULT_CHARS = 6_000;

/**
 * A tool result as the text the model reads. Structured and compact; when `data` is too long it is replaced by
 * a marked preview so the model knows it saw only part and can narrow its next call.
 */
export const formatResultForModel = (result: ToolResult, max = MAX_RESULT_CHARS): string => {
  const full = JSON.stringify(result);
  if (full.length <= max) return full;
  const { data, ...rest } = result;
  const head = JSON.stringify({ ...rest, data: { truncated: true, note: "The data was too long to show in full; narrow the request (find_elements, ids, limit)." } });
  const room = Math.max(0, max - head.length - 40);
  const preview = data ? JSON.stringify(data).slice(0, room) : "";
  return JSON.stringify({ ...rest, data: { truncated: true, preview, note: "The data was too long to show in full; narrow the request (find_elements, ids, limit)." } });
};

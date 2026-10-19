import { historySchema, messageChars, type CanvasMessage } from "./types";

export const HISTORY_MESSAGES = 30;
export const HISTORY_CHARS = 100_000;

/**
 * The part of a conversation sent back to the model next time: the last messages that fit the budget, starting at a
 * user message (the endpoint requires that, and a tool result without the call that made it is meaningless).
 */
export const trimHistory = (messages: readonly CanvasMessage[], maxMessages = HISTORY_MESSAGES, maxChars = HISTORY_CHARS): CanvasMessage[] => {
  let start = Math.max(0, messages.length - maxMessages);
  const total = () => messages.slice(start).reduce((sum, message) => sum + messageChars(message), 0);
  while (start < messages.length && (messages[start].role !== "user" || total() > maxChars)) start += 1;
  return messages.slice(start);
};

/** A stored history read back: anything that is not valid, or does not start with the user, is ignored rather than trusted. */
export const parseHistory = (stored: string | null | undefined): CanvasMessage[] => {
  if (!stored) return [];
  try {
    const parsed = historySchema.safeParse(JSON.parse(stored));
    if (!parsed.success || parsed.data[0]?.role !== "user") return [];
    return parsed.data as CanvasMessage[];
  } catch {
    return [];
  }
};

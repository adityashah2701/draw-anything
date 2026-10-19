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

export const SUMMARY_CHARS = 2_000;
const LINE_REQUEST = 160;
const LINE_REPLY = 120;

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** What the tool results of one turn did, from the results themselves (never from the model's own words). */
const outcomeOf = (turn: readonly CanvasMessage[]): string => {
  let calls = 0;
  let failed = 0;
  let changed = 0;
  for (const message of turn) {
    if (message.role !== "tool") continue;
    calls += 1;
    try {
      const result = JSON.parse(message.content) as { ok?: boolean; affected?: { created?: unknown[]; updated?: unknown[]; removed?: unknown[] } };
      if (result.ok === false) failed += 1;
      changed += (result.affected?.created?.length ?? 0) + (result.affected?.updated?.length ?? 0) + (result.affected?.removed?.length ?? 0);
    } catch {
      // a result that is not JSON (cut for length) still counts as a call
    }
  }
  if (calls === 0) return "no board changes";
  return `${changed} element${changed === 1 ? "" : "s"} changed in ${calls} call${calls === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`;
};

/**
 * One line per turn that has left the history window, appended to the earlier summary and cut from the front to
 * `SUMMARY_CHARS`. Built from the user's requests and the tool results, with no model call, so it costs nothing
 * and a note cannot grow into more than a line of text. The model gets it as data, below the live board.
 */
export const summarizeDropped = (dropped: readonly CanvasMessage[], previous: string | null | undefined, maxChars = SUMMARY_CHARS): string => {
  const turns: CanvasMessage[][] = [];
  for (const message of dropped) {
    if (message.role === "user") turns.push([message]);
    else turns[turns.length - 1]?.push(message);
  }
  const lines = turns.map((turn) => {
    const request = turn[0] as { content: string };
    const reply = [...turn].reverse().find((m) => m.role === "assistant" && m.content.trim() && !(m.toolCalls?.length)) as { content: string } | undefined;
    return `- Asked: "${oneLine(request.content, LINE_REQUEST)}" → ${outcomeOf(turn)}${reply ? `; said: "${oneLine(reply.content, LINE_REPLY)}"` : ""}`;
  });
  let all = [...(previous ? previous.split("\n").filter(Boolean) : []), ...lines];
  while (all.length > 1 && all.join("\n").length > maxChars) all = all.slice(1);
  const text = all.join("\n");
  return text.length > maxChars ? text.slice(text.length - maxChars) : text;
};

/** The history to keep and the updated summary, given the whole conversation after a run. */
export const compactHistory = (all: readonly CanvasMessage[], previousSummary: string | null | undefined): { history: CanvasMessage[]; summary: string | null } => {
  const history = trimHistory(all);
  const dropped = all.slice(0, all.length - history.length);
  const summary = dropped.length === 0 ? (previousSummary ?? null) : summarizeDropped(dropped, previousSummary);
  return { history, summary: summary || null };
};

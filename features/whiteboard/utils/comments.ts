import type { Point } from "@/features/whiteboard/types/whiteboard.types";

/** What `convex/comments.ts: list` returns for one comment. */
export interface CommentDto {
  _id: string;
  parentId?: string;
  x: number;
  y: number;
  text: string;
  resolved: boolean;
  createdAt: number;
  authorId: string;
  authorName: string;
  authorImageUrl: string;
  mine: boolean;
  mentions: Array<{ id: string; name: string }>;
  mentionsMe: boolean;
}

/** Someone who can be @mentioned on a board. */
export interface Participant {
  _id: string;
  name: string;
  imageUrl: string;
}

const MAX_QUERY = 30;

/** The `@name` being typed just before the caret, if any: `@` at the start or after whitespace, no line break since. */
export const mentionQueryAt = (text: string, caret: number): { start: number; query: string } | null => {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  return query.length > MAX_QUERY || query.includes("\n") ? null : { start: at, query };
};

/** People whose name contains the query (names starting with it first), at most `limit`. */
export const filterParticipants = (people: readonly Participant[], query: string, limit = 6): Participant[] => {
  const q = query.trim().toLowerCase();
  const rank = (p: Participant) => (p.name.toLowerCase().startsWith(q) ? 0 : p.name.toLowerCase().includes(q) ? 1 : 2);
  return people
    .filter((p) => rank(p) < 2)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
};

/** Replaces the `@query` that starts at `start` (ending at `caret`) with `@Name ` and returns the new caret. */
export const insertMention = (text: string, start: number, caret: number, name: string): { text: string; caret: number } => {
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
};

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

/** Ids of the picked people whose `@Name` is still in the text (deleting the text withdraws the mention). */
export const mentionsStillIn = (text: string, picked: readonly Participant[]): string[] =>
  picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p._id);

/** Splits text into plain and @mention runs, so mentions can be drawn highlighted. Longest names match first. */
export const mentionSegments = (text: string, mentions: ReadonlyArray<{ name: string }>): Array<{ text: string; mention: boolean }> => {
  const names = [...new Set(mentions.map((m) => `@${m.name}`))].sort((a, b) => b.length - a.length);
  const out: Array<{ text: string; mention: boolean }> = [];
  let plain = "";
  for (let i = 0; i < text.length; ) {
    const hit = names.find((n) => text.startsWith(n, i) && !isWordChar(text[i + n.length]) && (i === 0 || !isWordChar(text[i - 1])));
    if (hit) {
      if (plain) out.push({ text: plain, mention: false });
      plain = "";
      out.push({ text: hit, mention: true });
      i += hit.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push({ text: plain, mention: false });
  return out;
};

export interface Thread {
  root: CommentDto;
  replies: CommentDto[];
}

/**
 * Roots with their replies, both oldest first. A reply whose root is gone (deleted a moment ago, not yet
 * synced) is dropped rather than shown loose.
 */
export const groupThreads = (comments: readonly CommentDto[]): Thread[] => {
  const byTime = [...comments].sort((a, b) => a.createdAt - b.createdAt);
  const threads = new Map<string, Thread>();
  for (const comment of byTime) if (!comment.parentId) threads.set(comment._id, { root: comment, replies: [] });
  for (const comment of byTime) if (comment.parentId) threads.get(comment.parentId)?.replies.push(comment);
  return [...threads.values()];
};

export const visibleThreads = (threads: readonly Thread[], showResolved: boolean): Thread[] =>
  showResolved ? [...threads] : threads.filter((thread) => !thread.root.resolved);

export const worldToScreen = (point: Point, zoom: number, pan: Point): Point => ({
  x: point.x * zoom + pan.x,
  y: point.y * zoom + pan.y,
});

/** Where to open a thread card for a pin at `pin`, kept fully inside the stage. */
export const cardPosition = (pin: Point, card: { width: number; height: number }, stage: { width: number; height: number }): Point => {
  const GAP = 14;
  const x = pin.x + GAP + card.width > stage.width ? pin.x - GAP - card.width : pin.x + GAP;
  return {
    x: Math.max(8, Math.min(x, stage.width - card.width - 8)),
    y: Math.max(8, Math.min(pin.y - 16, stage.height - card.height - 8)),
  };
};

/** "just now", "5 min ago", "3 h ago", then a date. `now` is a parameter so tests do not depend on the clock. */
export const relativeTime = (at: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** The sentence a person can read out of a Convex error ("[CONVEX M(..)] ... Uncaught Error: <text>\n at ..."). */
export const friendlyError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "";
  const marker = "Uncaught Error: ";
  const at = message.indexOf(marker);
  if (at === -1) return "Could not send the comment. Try again.";
  return message.slice(at + marker.length).split("\n")[0].trim() || "Could not send the comment. Try again.";
};

/** Enter sends, Shift+Enter is a newline, and Enter while an IME is composing is the IME's. */
export const isSendKey = (e: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean =>
  e.key === "Enter" && !e.shiftKey && !e.isComposing;

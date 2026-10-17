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
}

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

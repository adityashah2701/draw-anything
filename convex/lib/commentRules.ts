/**
 * Pure rules for board comments. No Convex imports, so they are unit-tested and shared by every comment
 * function. Who may read or write comments at all is the whiteboard rule in `accessRules.ts`; these cover
 * what a comment may contain and who may remove one.
 */

export const MAX_COMMENT_CHARS = 2000;

/** Coordinates are board (world) units; anything beyond this is a bug or an attack, not a place on a board. */
export const MAX_COORDINATE = 1_000_000;

/** The trimmed text, or an error message to show the user. */
export const cleanCommentText = (text: unknown): { ok: true; text: string } | { ok: false; error: string } => {
  if (typeof text !== "string") return { ok: false, error: "A comment needs text." };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "A comment needs text." };
  if (trimmed.length > MAX_COMMENT_CHARS) return { ok: false, error: `Comments are limited to ${MAX_COMMENT_CHARS} characters.` };
  return { ok: true, text: trimmed };
};

export const isValidPosition = (x: unknown, y: unknown): boolean =>
  typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= MAX_COORDINATE && Math.abs(y) <= MAX_COORDINATE;

export const MAX_MENTIONS = 10;

/** The requested mentions that are allowed: unique, participants of the board, never the author, at most MAX_MENTIONS. */
export const pickValidMentions = (requested: readonly string[] | undefined, participants: ReadonlySet<string>, selfId: string): string[] =>
  [...new Set(requested ?? [])].filter((id) => id !== selfId && participants.has(id)).slice(0, MAX_MENTIONS);

/** A comment's author may remove it, and so may the board's creator (moderation). */
export const canDeleteComment = (callerId: string, comment: { authorId: string }, whiteboard: { createdBy: string }): boolean =>
  comment.authorId === callerId || whiteboard.createdBy === callerId;

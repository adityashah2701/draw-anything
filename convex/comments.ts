import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCaller, requireCaller, requireWhiteboardAccess, getAccessibleWhiteboard } from "./lib/access";
import { canDeleteComment, cleanCommentText, isValidPosition, pickValidMentions } from "./lib/commentRules";

const DENIED = "Unauthorized to comment on this whiteboard";

/**
 * Who may be @mentioned on a board: its creator and everyone who has already commented on it. Convex does
 * not know an organization's member list (Clerk does), so participation is what can be proven here.
 */
const participantsOf = async (ctx: Pick<QueryCtx, "db">, whiteboard: Doc<"whiteboards">) => {
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", whiteboard._id))
    .collect();
  const ids = new Set<Id<"users">>([whiteboard.createdBy, ...comments.map((c) => c.authorId)]);
  const users = await Promise.all([...ids].map((id) => ctx.db.get(id)));
  return users.flatMap((user) => (user ? [{ _id: user._id, name: user.name, imageUrl: user.imageUrl }] : []));
};

/** People the caller can @mention on this board (everyone who has taken part, except the caller). */
export const participants = query({
  args: { whiteboardId: v.id("whiteboards") },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return [];
    const whiteboard = await getAccessibleWhiteboard(ctx, caller, args.whiteboardId);
    if (!whiteboard) return [];
    return (await participantsOf(ctx, whiteboard)).filter((p) => p._id !== caller.userId);
  },
});

const mentionIds = async (ctx: Pick<QueryCtx, "db">, whiteboard: Doc<"whiteboards">, requested: Id<"users">[] | undefined, selfId: Id<"users">) => {
  if (!requested?.length) return undefined;
  const allowed = new Set<string>((await participantsOf(ctx, whiteboard)).map((p) => p._id));
  const picked = pickValidMentions(requested, allowed, selfId) as Id<"users">[];
  return picked.length ? picked : undefined;
};

/** Every comment on a board the caller can open, oldest first, with the author's public profile. Empty otherwise. */
export const list = query({
  args: { whiteboardId: v.id("whiteboards") },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return [];
    if (!(await getAccessibleWhiteboard(ctx, caller, args.whiteboardId))) return [];

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", args.whiteboardId))
      .collect();
    const authors = new Map<Id<"users">, Doc<"users"> | null>();
    for (const comment of comments) {
      if (!authors.has(comment.authorId)) authors.set(comment.authorId, await ctx.db.get(comment.authorId));
    }
    const mentionNames = new Map<Id<"users">, string>();
    for (const id of new Set(comments.flatMap((c) => c.mentions ?? []))) {
      if (!authors.has(id)) mentionNames.set(id, (await ctx.db.get(id))?.name ?? "Unknown");
    }
    return comments
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((comment) => ({
        _id: comment._id,
        parentId: comment.parentId,
        x: comment.x,
        y: comment.y,
        text: comment.text,
        resolved: comment.resolved ?? false,
        createdAt: comment.createdAt,
        authorId: comment.authorId,
        authorName: authors.get(comment.authorId)?.name ?? "Unknown",
        authorImageUrl: authors.get(comment.authorId)?.imageUrl ?? "",
        mine: comment.authorId === caller.userId,
        mentions: (comment.mentions ?? []).map((id) => ({ id, name: authors.get(id)?.name ?? mentionNames.get(id) ?? "Unknown" })),
        mentionsMe: (comment.mentions ?? []).includes(caller.userId),
      }));
  },
});

/** Starts a thread at a board position. */
export const create = mutation({
  args: { whiteboardId: v.id("whiteboards"), x: v.number(), y: v.number(), text: v.string(), mentions: v.optional(v.array(v.id("users"))) },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const whiteboard = await requireWhiteboardAccess(ctx, caller, args.whiteboardId, DENIED);
    const text = cleanCommentText(args.text);
    if (!text.ok) throw new Error(text.error);
    if (!isValidPosition(args.x, args.y)) throw new Error("Invalid comment position");
    return await ctx.db.insert("comments", {
      whiteboardId: args.whiteboardId,
      x: args.x,
      y: args.y,
      text: text.text,
      authorId: caller.userId,
      mentions: await mentionIds(ctx, whiteboard, args.mentions, caller.userId),
      createdAt: Date.now(),
    });
  },
});

/** Adds a reply to a thread. Replies to replies attach to the thread root. */
export const reply = mutation({
  args: { threadId: v.id("comments"), text: v.string(), mentions: v.optional(v.array(v.id("users"))) },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const root = await ctx.db.get(args.threadId);
    if (!root || root.parentId) throw new Error("Thread not found");
    const whiteboard = await requireWhiteboardAccess(ctx, caller, root.whiteboardId, DENIED);
    const text = cleanCommentText(args.text);
    if (!text.ok) throw new Error(text.error);
    return await ctx.db.insert("comments", {
      whiteboardId: root.whiteboardId,
      parentId: root._id,
      x: root.x,
      y: root.y,
      text: text.text,
      authorId: caller.userId,
      mentions: await mentionIds(ctx, whiteboard, args.mentions, caller.userId),
      createdAt: Date.now(),
    });
  },
});

/** Resolves or reopens a thread; anyone who can use the board may. */
export const setResolved = mutation({
  args: { threadId: v.id("comments"), resolved: v.boolean() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const root = await ctx.db.get(args.threadId);
    if (!root || root.parentId) throw new Error("Thread not found");
    await requireWhiteboardAccess(ctx, caller, root.whiteboardId, DENIED);
    await ctx.db.patch(root._id, { resolved: args.resolved });
  },
});

/** Deletes a comment (author or board creator). Deleting a thread root deletes its replies. */
export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) return;
    const whiteboard = await requireWhiteboardAccess(ctx, caller, comment.whiteboardId, DENIED);
    if (!canDeleteComment(caller.userId, comment, whiteboard)) throw new Error("Only the author can delete this comment");
    if (!comment.parentId) {
      const replies = await ctx.db
        .query("comments")
        .withIndex("by_parentId", (q) => q.eq("parentId", comment._id))
        .collect();
      for (const reply of replies) await ctx.db.delete(reply._id);
    }
    await ctx.db.delete(comment._id);
  },
});

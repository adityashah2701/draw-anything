import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getAccessibleWhiteboardByRawId,
  getCaller,
  requireCaller,
} from "./lib/access";

/** The most messages kept per board; older ones are deleted as new ones arrive. */
export const MAX_MESSAGES = 500;
const MAX_CONTENT = 24_000;
const MAX_HISTORY = 120_000;
const MAX_SUMMARY = 4_000;
/** A run holds the board's assistant for this long unless it renews; a crashed tab frees it by itself. */
export const LEASE_MS = 90_000;
const MAX_BATCH = 40;
const DEFAULT_LIMIT = 200;

const role = v.union(v.literal("user"), v.literal("assistant"), v.literal("tool"), v.literal("status"));

/**
 * The one assistant conversation of a board, shared by everyone who can open it. Reading and writing follow
 * the board's own access rule (creator and members of its organisation), nothing wider.
 */
export const get = query({
  args: { whiteboardId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return null;
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) return null;
    const conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation) return { conversationId: null, history: null, summary: null, running: null, messages: [] };
    const now = Date.now();
    const holder = conversation.runningBy && conversation.leaseUntil && conversation.leaseUntil > now ? await ctx.db.get(conversation.runningBy) : null;
    const messages = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation_seq", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_MESSAGES));
    return {
      conversationId: conversation._id,
      history: conversation.history ?? null,
      summary: conversation.summary ?? null,
      running: holder ? { runId: conversation.runId ?? "", byName: holder.name, mine: holder._id === caller.userId, until: conversation.leaseUntil! } : null,
      messages: messages.reverse().map((m) => ({ id: m._id, seq: m.seq, role: m.role, content: m.content, authorId: m.authorId, ui: m.ui, createdAt: m.createdAt })),
    };
  },
});

export const append = mutation({
  args: {
    whiteboardId: v.string(),
    messages: v.array(v.object({ role, content: v.string(), ui: v.optional(v.any()) })),
    /** The model-facing history after this run; replaces the stored one. */
    history: v.optional(v.string()),
    /** The rolling summary of turns that have left `history`; replaces the stored one. */
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) throw new Error("Unauthorized");
    if (args.summary !== undefined && args.summary.length > MAX_SUMMARY) throw new Error("Summary is too large");
    if (args.messages.length > MAX_BATCH) throw new Error("Too many messages in one write");
    if (args.history !== undefined && args.history.length > MAX_HISTORY) throw new Error("History is too large");

    const now = Date.now();
    let conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation) {
      const id = await ctx.db.insert("aiConversations", { whiteboardId: board._id, messageCount: 0, createdAt: now, updatedAt: now });
      conversation = (await ctx.db.get(id))!;
    }

    const last = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation_seq", (q) => q.eq("conversationId", conversation!._id))
      .order("desc")
      .first();
    let seq = last?.seq ?? 0;
    for (const message of args.messages) {
      seq += 1;
      await ctx.db.insert("aiMessages", {
        conversationId: conversation._id,
        seq,
        role: message.role,
        content: message.content.slice(0, MAX_CONTENT),
        ...(message.role === "user" ? { authorId: caller.userId } : {}),
        ...(message.ui !== undefined ? { ui: message.ui } : {}),
        createdAt: now,
      });
    }

    // Keep the newest MAX_MESSAGES.
    let count = conversation.messageCount + args.messages.length;
    if (count > MAX_MESSAGES) {
      const oldest = await ctx.db
        .query("aiMessages")
        .withIndex("by_conversation_seq", (q) => q.eq("conversationId", conversation!._id))
        .order("asc")
        .take(count - MAX_MESSAGES);
      for (const row of oldest) await ctx.db.delete(row._id);
      count -= oldest.length;
    }
    await ctx.db.patch(conversation._id, {
      messageCount: count,
      updatedAt: now,
      ...(args.history !== undefined ? { history: args.history } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
    });
    return { conversationId: conversation._id, lastSeq: seq };
  },
});

/** Empties the board's conversation (the "Clear" button). The legacy `aiFrames` rows are not touched. */
export const clear = mutation({
  args: { whiteboardId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) throw new Error("Unauthorized");
    const conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation) return 0;
    const rows = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation_seq", (q) => q.eq("conversationId", conversation._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.patch(conversation._id, { messageCount: 0, history: undefined, summary: undefined, updatedAt: Date.now() });
    return rows.length;
  },
});

/**
 * Brings the board's legacy generation history (`aiFrames`) into the conversation as a prompt and an outcome
 * line per frame, oldest first, once. Safe to call again: frames already imported are skipped. It only reads
 * `aiFrames`; nothing is deleted or changed there.
 */
export const importLegacyFrames = mutation({
  args: { whiteboardId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) throw new Error("Unauthorized");
    const frames = await ctx.db
      .query("aiFrames")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", args.whiteboardId))
      .collect();
    if (frames.length === 0) return { imported: 0 };

    const now = Date.now();
    let conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation) {
      const id = await ctx.db.insert("aiConversations", { whiteboardId: board._id, messageCount: 0, createdAt: now, updatedAt: now });
      conversation = (await ctx.db.get(id))!;
    }

    const pending = [];
    for (const frame of frames.sort((a, b) => a.createdAt - b.createdAt)) {
      const done = await ctx.db
        .query("aiMessages")
        .withIndex("by_sourceFrameId", (q) => q.eq("sourceFrameId", frame.frameId))
        .first();
      if (!done) pending.push(frame);
    }
    if (pending.length === 0) return { imported: 0 };

    // Imported history goes before anything already said: seqs are negative so ordering by seq keeps it first.
    const first = await ctx.db
      .query("aiMessages")
      .withIndex("by_conversation_seq", (q) => q.eq("conversationId", conversation!._id))
      .order("asc")
      .first();
    let seq = Math.min(first?.seq ?? 1, 1) - pending.length * 2 - 1;
    for (const frame of pending) {
      const outcome =
        frame.status === "completed"
          ? `Generated ${frame.finalElementIds?.length ?? 0} elements.`
          : frame.status === "failed"
            ? `Generation failed${frame.errorMessage ? `: ${frame.errorMessage}` : "."}`
            : `Generation ${frame.status}.`;
      seq += 1;
      await ctx.db.insert("aiMessages", { conversationId: conversation._id, seq, role: "user", content: frame.prompt.slice(0, MAX_CONTENT), authorId: frame.createdBy, sourceFrameId: frame.frameId, createdAt: frame.createdAt });
      seq += 1;
      await ctx.db.insert("aiMessages", { conversationId: conversation._id, seq, role: "status", content: outcome, ui: { tone: frame.status === "completed" ? "ok" : "warn" }, sourceFrameId: frame.frameId, createdAt: frame.updatedAt });
    }
    await ctx.db.patch(conversation._id, { messageCount: conversation.messageCount + pending.length * 2, updatedAt: now });
    return { imported: pending.length };
  },
});

/** The summary of older turns, for the model's prompt (read by the server as the signed-in user). */
export const summary = query({
  args: { whiteboardId: v.string() },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return null;
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) return null;
    const conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    return conversation?.summary ?? null;
  },
});

// ── One run at a time ─────────────────────────────────────────────────────────

/**
 * Takes the board's assistant for one run. Succeeds when nobody holds it (or the lease ran out, or the caller
 * already holds it with this runId); otherwise says who does, so the panel can show it.
 */
export const acquireRun = mutation({
  args: { whiteboardId: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) throw new Error("Unauthorized");
    if (args.runId.length < 8 || args.runId.length > 64) throw new Error("Invalid run id");
    const now = Date.now();
    let conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation) {
      const id = await ctx.db.insert("aiConversations", { whiteboardId: board._id, messageCount: 0, createdAt: now, updatedAt: now });
      conversation = (await ctx.db.get(id))!;
    }
    const held = conversation.runningBy && conversation.leaseUntil && conversation.leaseUntil > now && conversation.runId !== args.runId;
    if (held) {
      const holder = await ctx.db.get(conversation.runningBy!);
      return { ok: false as const, byName: holder?.name ?? "Someone", mine: conversation.runningBy === caller.userId };
    }
    await ctx.db.patch(conversation._id, { runningBy: caller.userId, runId: args.runId, leaseUntil: now + LEASE_MS });
    return { ok: true as const };
  },
});

/** Extends the lease while the run is still working; false when it was lost (expired and taken by someone else). */
export const renewRun = mutation({
  args: { whiteboardId: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) throw new Error("Unauthorized");
    const conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation || conversation.runId !== args.runId || conversation.runningBy !== caller.userId) return false;
    await ctx.db.patch(conversation._id, { leaseUntil: Date.now() + LEASE_MS });
    return true;
  },
});

export const releaseRun = mutation({
  args: { whiteboardId: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const board = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!board) throw new Error("Unauthorized");
    const conversation = await ctx.db
      .query("aiConversations")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", board._id))
      .unique();
    if (!conversation || conversation.runId !== args.runId || conversation.runningBy !== caller.userId) return false;
    await ctx.db.patch(conversation._id, { runningBy: undefined, runId: undefined, leaseUntil: undefined });
    return true;
  },
});

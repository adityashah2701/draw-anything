import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getAccessibleWhiteboardByRawId,
  getCaller,
  requireCaller,
} from "./lib/access";

export const createMemory = mutation({
  args: {
    whiteboardId: v.optional(v.string()),
    summary: v.string(),
    prompt: v.optional(v.string()),
    finalGraphSummary: v.optional(v.string()),
    userCorrections: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    status: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("generated")),
    tags: v.array(v.string()),
    payload: v.optional(v.any()),
    sourceFrameId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    if (args.whiteboardId) {
      const whiteboard = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
      if (!whiteboard) throw new Error("Unauthorized");
    }
    const now = Date.now();
    return await ctx.db.insert("aiMemories", {
      ...args,
      userId: caller.userId,
      orgId: caller.orgId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listByWhiteboard = query({
  args: {
    whiteboardId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return [];
    const whiteboard = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!whiteboard) return [];
    return await ctx.db
      .query("aiMemories")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", args.whiteboardId))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 12, 1), 100));
  },
});

export const createDecision = mutation({
  args: {
    frameId: v.string(),
    whiteboardId: v.optional(v.string()),
    decisionType: v.string(),
    summary: v.string(),
    rationale: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    if (args.whiteboardId) {
      const whiteboard = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
      if (!whiteboard) throw new Error("Unauthorized");
    }
    const frame = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    if (frame && frame.createdBy !== caller.userId) throw new Error("Unauthorized");
    return await ctx.db.insert("aiDecisions", {
      ...args,
      createdBy: caller.userId,
      orgId: caller.orgId,
      createdAt: Date.now(),
    });
  },
});

export const listDecisionsByFrame = query({
  args: {
    frameId: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return [];
    const frame = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    if (!frame || frame.createdBy !== caller.userId) return [];
    return await ctx.db
      .query("aiDecisions")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .collect();
  },
});

// ── Board memory: what people ask the agent to remember (the `remember` tool) ─────────────────

export const MAX_BOARD_MEMORIES = 30;
const MAX_MEMORY_TEXT = 300;
const kindValidator = v.union(v.literal("preference"), v.literal("correction"), v.literal("decision"), v.literal("fact"));

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Memories saved by people through `remember`; legacy rows (no `text`) are not returned. */
export const listForBoard = query({
  args: { whiteboardId: v.string() },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return [];
    const whiteboard = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!whiteboard) return [];
    const rows = await ctx.db
      .query("aiMemories")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", args.whiteboardId))
      .order("desc")
      .take(100);
    return rows
      .filter((row) => typeof row.text === "string" && row.kind !== undefined)
      .slice(0, MAX_BOARD_MEMORIES)
      .map((row) => ({ id: row._id, kind: row.kind!, text: row.text!, createdAt: row.createdAt }));
  },
});

export const remember = mutation({
  args: { whiteboardId: v.string(), kind: kindValidator, text: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const whiteboard = await getAccessibleWhiteboardByRawId(ctx, caller, args.whiteboardId);
    if (!whiteboard) throw new Error("Unauthorized");
    const text = normalize(args.text);
    if (text.length < 3 || text.length > MAX_MEMORY_TEXT) throw new Error("A memory must be 3 to 300 characters");

    const existing = await ctx.db
      .query("aiMemories")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", args.whiteboardId))
      .order("desc")
      .collect();
    const mine = existing.filter((row) => typeof row.text === "string" && row.kind !== undefined);
    const duplicate = mine.find((row) => row.text!.toLowerCase() === text.toLowerCase());
    if (duplicate) return { id: duplicate._id, duplicate: true };

    const now = Date.now();
    const id = await ctx.db.insert("aiMemories", {
      whiteboardId: args.whiteboardId,
      userId: caller.userId,
      orgId: caller.orgId,
      summary: text,
      text,
      kind: args.kind,
      status: "accepted",
      tags: [args.kind],
      createdAt: now,
      updatedAt: now,
    });
    // Newest wins: past the cap the oldest go.
    for (const row of mine.slice(MAX_BOARD_MEMORIES - 1)) await ctx.db.delete(row._id);
    return { id, duplicate: false };
  },
});

export const forget = mutation({
  args: { id: v.id("aiMemories") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || !row.whiteboardId) return false;
    const whiteboard = await getAccessibleWhiteboardByRawId(ctx, caller, row.whiteboardId);
    if (!whiteboard) throw new Error("Unauthorized");
    await ctx.db.delete(args.id);
    return true;
  },
});

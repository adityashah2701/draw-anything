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

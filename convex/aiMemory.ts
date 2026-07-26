import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const getCurrentUser = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return { user, identity };
};

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
    const { user, identity } = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("aiMemories", {
      ...args,
      userId: user._id,
      orgId: identity.org_id || identity.organization_id,
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
    await getCurrentUser(ctx);
    const memories = await ctx.db
      .query("aiMemories")
      .withIndex("by_whiteboardId", (q) => q.eq("whiteboardId", args.whiteboardId))
      .order("desc")
      .take(args.limit ?? 12);
    return memories;
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
    const { user, identity } = await getCurrentUser(ctx);
    return await ctx.db.insert("aiDecisions", {
      ...args,
      createdBy: user._id,
      orgId: identity.org_id || identity.organization_id,
      createdAt: Date.now(),
    });
  },
});

export const listDecisionsByFrame = query({
  args: {
    frameId: v.string(),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);
    return await ctx.db
      .query("aiDecisions")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .collect();
  },
});

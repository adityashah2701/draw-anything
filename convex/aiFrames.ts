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

export const create = mutation({
  args: {
    frameId: v.string(),
    whiteboardId: v.optional(v.string()),
    prompt: v.string(),
    provider: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    const { user, identity } = await getCurrentUser(ctx);
    const existing = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    const now = Date.now();
    const orgId = identity.org_id || identity.organization_id;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        currentPhase: "contextRetriever",
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("aiFrames", {
      frameId: args.frameId,
      whiteboardId: args.whiteboardId,
      prompt: args.prompt,
      provider: args.provider,
      status: args.status,
      currentPhase: "contextRetriever",
      createdBy: user._id,
      orgId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const appendCheckpoint = mutation({
  args: {
    frameId: v.string(),
    phase: v.string(),
    summary: v.string(),
    at: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await getCurrentUser(ctx);
    const frame = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    if (!frame) return null;

    await ctx.db.insert("aiFrameCheckpoints", {
      frameId: args.frameId,
      phase: args.phase,
      summary: args.summary,
      at: args.at,
      createdBy: user._id,
    });
    await ctx.db.patch(frame._id, {
      currentPhase: args.phase,
      status: "running",
      updatedAt: Date.now(),
    });
    return frame._id;
  },
});

export const complete = mutation({
  args: {
    frameId: v.string(),
    finalElementIds: v.array(v.string()),
    finalGraph: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);
    const frame = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    if (!frame) return null;

    await ctx.db.patch(frame._id, {
      status: "completed",
      currentPhase: "canvasCompiler",
      finalElementIds: args.finalElementIds,
      finalGraph: args.finalGraph,
      updatedAt: Date.now(),
    });
    return frame._id;
  },
});

export const fail = mutation({
  args: {
    frameId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);
    const frame = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    if (!frame) return null;

    await ctx.db.patch(frame._id, {
      status: "failed",
      errorMessage: args.message,
      updatedAt: Date.now(),
    });
    return frame._id;
  },
});

export const listByWhiteboard = query({
  args: {
    whiteboardId: v.string(),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);
    return await ctx.db
      .query("aiFrames")
      .withIndex("by_whiteboardId", (q) =>
        q.eq("whiteboardId", args.whiteboardId),
      )
      .collect();
  },
});

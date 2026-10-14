import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getAccessibleWhiteboardByRawId,
  getCaller,
  requireCaller,
} from "./lib/access";

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
    const caller = await requireCaller(ctx);
    if (args.whiteboardId) {
      const whiteboard = await getAccessibleWhiteboardByRawId(
        ctx,
        caller,
        args.whiteboardId,
      );
      if (!whiteboard) throw new Error("Unauthorized");
    }

    const existing = await ctx.db
      .query("aiFrames")
      .withIndex("by_frameId", (q) => q.eq("frameId", args.frameId))
      .unique();
    const now = Date.now();

    if (existing) {
      // A frame id is a capability for its creator only; never adopt someone else's.
      if (existing.createdBy !== caller.userId) throw new Error("Unauthorized");
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
      createdBy: caller.userId,
      orgId: caller.orgId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Loads a frame the caller created; null if it does not exist. Throws if it is someone else's. */
const loadOwnedFrame = async (
  ctx: Parameters<typeof requireCaller>[0],
  callerId: string,
  frameId: string,
) => {
  const frame = await ctx.db
    .query("aiFrames")
    .withIndex("by_frameId", (q) => q.eq("frameId", frameId))
    .unique();
  if (frame && frame.createdBy !== callerId) throw new Error("Unauthorized");
  return frame;
};

export const appendCheckpoint = mutation({
  args: {
    frameId: v.string(),
    phase: v.string(),
    summary: v.string(),
    at: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const frame = await loadOwnedFrame(ctx, caller.userId, args.frameId);
    if (!frame) return null;

    await ctx.db.insert("aiFrameCheckpoints", {
      frameId: args.frameId,
      phase: args.phase,
      summary: args.summary,
      at: args.at,
      createdBy: caller.userId,
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
    const caller = await requireCaller(ctx);
    const frame = await loadOwnedFrame(ctx, caller.userId, args.frameId);
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
    const caller = await requireCaller(ctx);
    const frame = await loadOwnedFrame(ctx, caller.userId, args.frameId);
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
    const caller = await getCaller(ctx);
    if (!caller) return [];
    const whiteboard = await getAccessibleWhiteboardByRawId(
      ctx,
      caller,
      args.whiteboardId,
    );
    if (!whiteboard) return [];
    return await ctx.db
      .query("aiFrames")
      .withIndex("by_whiteboardId", (q) =>
        q.eq("whiteboardId", args.whiteboardId),
      )
      .collect();
  },
});

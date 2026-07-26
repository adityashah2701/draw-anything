import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.string(),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
    clerkSubscriptionId: v.optional(v.string()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  whiteboards: defineTable({
    title: v.string(),
    imageUrl: v.optional(v.string()), // Keep for backward compatibility
    imageFileId: v.optional(v.id("_storage")), // Convex file storage ID
    content: v.optional(v.string()), // JSON string of whiteboard content
    createdBy: v.id("users"),
    orgId: v.string(),
    tags: v.optional(v.array(v.string())),
    lastModifiedBy: v.optional(v.id("users")),
  })
    .index("by_createdBy", ["createdBy"])
    .index("by_organizationId", ["orgId"])
    .index("by_createdBy_orgId", ["createdBy", "orgId"]),

  aiFrames: defineTable({
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
    currentPhase: v.optional(v.string()),
    finalElementIds: v.optional(v.array(v.string())),
    finalGraph: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    createdBy: v.id("users"),
    orgId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_frameId", ["frameId"])
    .index("by_whiteboardId", ["whiteboardId"])
    .index("by_createdBy", ["createdBy"]),

  aiFrameCheckpoints: defineTable({
    frameId: v.string(),
    phase: v.string(),
    summary: v.string(),
    at: v.string(),
    createdBy: v.id("users"),
  }).index("by_frameId", ["frameId"]),

  aiMemories: defineTable({
    whiteboardId: v.optional(v.string()),
    userId: v.id("users"),
    orgId: v.optional(v.string()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_whiteboardId", ["whiteboardId"])
    .index("by_userId", ["userId"])
    .index("by_orgId", ["orgId"])
    .index("by_sourceFrameId", ["sourceFrameId"]),

  aiDecisions: defineTable({
    frameId: v.string(),
    whiteboardId: v.optional(v.string()),
    decisionType: v.string(),
    summary: v.string(),
    rationale: v.optional(v.string()),
    payload: v.optional(v.any()),
    createdBy: v.id("users"),
    orgId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_frameId", ["frameId"])
    .index("by_whiteboardId", ["whiteboardId"])
    .index("by_createdBy", ["createdBy"]),
});

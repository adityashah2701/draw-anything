import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.string(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),


  whiteboards: defineTable({
    title: v.string(),
    imageUrl: v.optional(v.string()),
    content: v.optional(v.string()), // JSON string of whiteboard content
    createdBy: v.id("users"),
    orgId: v.string(),
    tags: v.optional(v.array(v.string())),
    lastModifiedBy:v.optional(v.id("users"))
  })
    .index("by_createdBy", ["createdBy"])
    .index("by_organizationId", ["orgId"])
    .index("by_createdBy_orgId", ["createdBy", "orgId"]),
});

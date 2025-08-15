import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
const images = [
  "/placeholders/1.svg",
  "/placeholders/2.svg",
  "/placeholders/3.svg",
  "/placeholders/4.svg",
  "/placeholders/5.svg",
  "/placeholders/6.svg",
  "/placeholders/7.svg",
  "/placeholders/8.svg",
  "/placeholders/9.svg",
  "/placeholders/10.svg",
  "/placeholders/11.svg",
  "/placeholders/12.svg",
  "/placeholders/13.svg",
  "/placeholders/14.svg",
  "/placeholders/15.svg",
  "/placeholders/16.svg",
  "/placeholders/17.svg",
  "/placeholders/18.svg",
  "/placeholders/19.svg",
  "/placeholders/20.svg",
  "/placeholders/21.svg",
  "/placeholders/22.svg",
  "/placeholders/23.svg",
  "/placeholders/24.svg",
  "/placeholders/25.svg",
  "/placeholders/26.svg",
  "/placeholders/27.svg",
  "/placeholders/28.svg",
  "/placeholders/29.svg",
  "/placeholders/30.svg",
  "/placeholders/31.svg",
  "/placeholders/32.svg",
  "/placeholders/33.svg",
  "/placeholders/34.svg",
];
export const create = mutation({
  args: {
    title: v.string(),
    orgId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized!");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("Unauthorized");
    }
    const randomImage = images[Math.floor(Math.random() * images.length)];

    const whiteboard = await ctx.db.insert("whiteboards", {
      title: args.title,
      createdBy: currentUser._id,
      orgId: args.orgId,
      imageUrl: randomImage,
    });

    return whiteboard;
  },
});

export const getAll = query({
  args: {
    orgId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized!");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    const whiteboards = await ctx.db
      .query("whiteboards")
      .withIndex("by_organizationId", (q) => q.eq("orgId", args.orgId))
      .collect();

    // Sort by _creationTime (latest first)
    return whiteboards.sort((a, b) => b._creationTime - a._creationTime);
  },
});
export const remove = mutation({
  args: {
    id: v.id("whiteboards"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized!");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    // Check if whiteboard exists and user has permission
    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }

    if (whiteboard.createdBy !== currentUser._id) {
      throw new Error("Unauthorized to delete this whiteboard");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const update = mutation({
  args: {
    id: v.id("whiteboards"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized!");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    // Check if whiteboard exists
    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }

    // Get the user's current organization ID
    // This should come from the user's current context/session
    // You might need to add orgId to the args or get it from the user's profile
    const userOrgId = identity.org_id || identity.organization_id;

    // Allow access if:
    // 1. User is the creator, OR
    // 2. User is in the same organization as the whiteboard
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      (userOrgId && whiteboard.orgId === userOrgId);

    if (!hasAccess) {
      throw new Error("Unauthorized to update this whiteboard");
    }

    const { id, ...updateFields } = args;

    // Remove undefined fields
    const fieldsToUpdate = Object.fromEntries(
      Object.entries(updateFields).filter(([_, value]) => value !== undefined)
    );

    await ctx.db.patch(args.id, fieldsToUpdate);
    return args.id;
  },
});

// Alternative approach: Pass orgId explicitly in the mutation args
export const updateWithOrgId = mutation({
  args: {
    id: v.id("whiteboards"),
    orgId: v.string(), // Explicitly pass the organization ID
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized!");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }

    if (whiteboard.orgId !== args.orgId) {
      throw new Error("Organization mismatch");
    }
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      whiteboard.orgId === args.orgId;

    if (!hasAccess) {
      throw new Error("Unauthorized to update this whiteboard");
    }

    const { id, orgId, ...updateFields } = args;

    // Remove undefined fields
    const fieldsToUpdate = Object.fromEntries(
      Object.entries(updateFields).filter(([_, value]) => value !== undefined)
    );

    await ctx.db.patch(args.id, fieldsToUpdate);
    return args.id;
  },
});

// Enhanced version with explicit organization membership check
export const updateWithMembershipCheck = mutation({
  args: {
    id: v.id("whiteboards"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized!");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    // Check if whiteboard exists
    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }
    const userOrgId = identity.org_id || identity.organization_id;
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      (userOrgId && whiteboard.orgId === userOrgId);

    if (!hasAccess) {
      throw new Error("Unauthorized to update this whiteboard");
    }

    const { id, ...updateFields } = args;

    // Remove undefined fields
    const fieldsToUpdate = Object.fromEntries(
      Object.entries(updateFields).filter(([_, value]) => value !== undefined)
    );

    // Optionally, you could track who made the last update
    const finalUpdateFields = {
      ...fieldsToUpdate,
      lastModifiedBy: currentUser._id,
      lastModifiedAt: Date.now(),
    };

    await ctx.db.patch(args.id, finalUpdateFields);
    return args.id;
  },
});

export const getById = query({
  args: {
    id: v.id("whiteboards"),
  },
  handler: async (ctx, args) => {
    const whiteboard = await ctx.db.get(args.id);
    return whiteboard;
  },
});

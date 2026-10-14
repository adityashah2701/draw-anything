import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCaller } from "./lib/access";
import { toUserView } from "./lib/accessRules";

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    // Check if user already exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (user !== null) {
      if (
        user.name !== identity.name ||
        user.imageUrl !== identity.pictureUrl ||
        user.email !== identity.email
      ) {
        await ctx.db.patch(user._id, {
          name: identity.name || user.name,
          imageUrl: identity.pictureUrl || user.imageUrl,
          email: identity.email || user.email,
        });
      }
      return user._id;
    }

    // If it's a new identity, create a new User
    const newUserId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      name: identity.name!,
      email: identity.email!,
      imageUrl: identity.pictureUrl!,
      plan: "free",
    });

    return newUserId;
  },
});

export const createUser = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.string(),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      plan: args.plan || "free",
    });
  },
});
export const deleteUser = internalMutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return currentUser || null;
  },
});
/**
 * Other users are visible only as an author chip (name, picture, Clerk id).
 * Email, plan and billing ids are returned for the caller's own record only.
 */
export const getById = query({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return null;
    const user = await ctx.db.get(args.id);
    return user ? toUserView(user, caller.userId) : null;
  },
});

export const updateSubscription = internalMutation({
  args: {
    clerkId: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro")),
    clerkSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, {
        plan: args.plan,
        clerkSubscriptionId: args.clerkSubscriptionId,
      });
    }
  },
});

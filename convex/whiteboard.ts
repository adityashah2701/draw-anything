import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  getAccessibleWhiteboard,
  getCaller,
  requireCaller,
  requireWhiteboardAccess,
} from "./lib/access";
import { canCreateInOrg } from "./lib/accessRules";

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
    const caller = await requireCaller(ctx);
    if (!canCreateInOrg(caller, args.orgId)) {
      throw new Error("Unauthorized to create a whiteboard in this organization");
    }
    const randomImage = images[Math.floor(Math.random() * images.length)];

    const whiteboard = await ctx.db.insert("whiteboards", {
      title: args.title,
      createdBy: caller.userId,
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
    const caller = await requireCaller(ctx);

    // Members of the requested organization see all of its whiteboards; anyone
    // else only sees the ones they created there.
    const whiteboards =
      caller.orgId === args.orgId
        ? await ctx.db
            .query("whiteboards")
            .withIndex("by_organizationId", (q) => q.eq("orgId", args.orgId))
            .collect()
        : await ctx.db
            .query("whiteboards")
            .withIndex("by_createdBy_orgId", (q) =>
              q.eq("createdBy", caller.userId).eq("orgId", args.orgId),
            )
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
    const caller = await requireCaller(ctx);

    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) {
      throw new Error("Whiteboard not found");
    }

    // Deleting is limited to the creator.
    if (whiteboard.createdBy !== caller.userId) {
      throw new Error("Unauthorized to delete this whiteboard");
    }

    // Delete associated file if it exists
    if (whiteboard.imageFileId) {
      try {
        await ctx.storage.delete(whiteboard.imageFileId);
      } catch (error) {
        // Continue with deletion even if file deletion fails
        console.error("Failed to delete associated file:", error);
      }
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
    const caller = await requireCaller(ctx);
    await requireWhiteboardAccess(
      ctx,
      caller,
      args.id,
      "Unauthorized to update this whiteboard",
    );

    const { id, ...updateFields } = args;

    const fieldsToUpdate = Object.fromEntries(
      Object.entries(updateFields).filter(([, value]) => value !== undefined),
    );

    fieldsToUpdate.lastModifiedBy = caller.userId;

    await ctx.db.patch(id, fieldsToUpdate);
    return id;
  },
});

/** The whiteboard when the caller may use it; null when missing or not theirs. */
export const getById = query({
  args: {
    id: v.id("whiteboards"),
  },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return null;
    return await getAccessibleWhiteboard(ctx, caller, args.id);
  },
});

/**
 * Used by the realtime server to decide whether a signed-in user may join a
 * whiteboard's room. Returns null instead of throwing so callers cannot probe
 * which ids exist.
 */
export const getAccess = query({
  args: {
    id: v.id("whiteboards"),
  },
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);
    if (!caller) return null;
    const whiteboard = await getAccessibleWhiteboard(ctx, caller, args.id);
    return whiteboard ? { canEdit: true as const } : null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateImage = mutation({
  args: {
    id: v.id("whiteboards"),
    imageFileId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const whiteboard = await requireWhiteboardAccess(
      ctx,
      caller,
      args.id,
      "You don't have permission to edit this whiteboard",
    );

    // If there's a new image, delete the old one
    if (args.imageFileId && whiteboard.imageFileId) {
      try {
        await ctx.storage.delete(whiteboard.imageFileId);
      } catch (error) {
        console.error("Failed to delete old image file:", error);
      }
    }

    // Get the image URL if imageFileId is provided
    let imageUrl: string | null | undefined = whiteboard.imageUrl;
    if (args.imageFileId) {
      imageUrl = await ctx.storage.getUrl(args.imageFileId);
    }

    const updateData: Partial<Doc<"whiteboards">> = {
      lastModifiedBy: caller.userId,
    };

    if (args.imageFileId !== undefined) {
      updateData.imageFileId = args.imageFileId;
      updateData.imageUrl = imageUrl ?? undefined;
    }

    if (args.tags !== undefined) {
      updateData.tags = args.tags;
    }

    await ctx.db.patch(args.id, updateData);

    return { success: true, imageUrl };
  },
});

// Remove image from whiteboard
export const removeImage = mutation({
  args: {
    id: v.id("whiteboards"),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const whiteboard = await requireWhiteboardAccess(
      ctx,
      caller,
      args.id,
      "You don't have permission to edit this whiteboard",
    );

    // Delete the stored file if it exists
    if (whiteboard.imageFileId) {
      try {
        await ctx.storage.delete(whiteboard.imageFileId);
      } catch (error) {
        console.error("Failed to delete image file:", error);
      }
    }

    // Set a random placeholder image
    const randomImage = images[Math.floor(Math.random() * images.length)];

    await ctx.db.patch(args.id, {
      imageFileId: undefined,
      imageUrl: randomImage, // Set back to placeholder instead of undefined
      lastModifiedBy: caller.userId,
    });

    return { success: true };
  },
});

// Enhanced editImage mutation (keeping for backward compatibility)
export const editImage = mutation({
  args: {
    id: v.id("whiteboards"),
    image: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    await requireWhiteboardAccess(
      ctx,
      caller,
      args.id,
      "You don't have permission to edit this whiteboard",
    );

    const updateData: Partial<Doc<"whiteboards">> = {
      lastModifiedBy: caller.userId,
    };

    if (args.image !== undefined) {
      updateData.imageUrl = args.image;
      // Clear file ID if setting a URL manually
      updateData.imageFileId = undefined;
    }

    if (args.tags !== undefined) {
      updateData.tags = args.tags;
    }

    await ctx.db.patch(args.id, updateData);
    return { success: true };
  },
});

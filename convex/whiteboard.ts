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
    const userOrgId = identity.org_id || identity.organization_id;
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      (userOrgId && whiteboard.orgId === userOrgId);

    if (!hasAccess) {
      throw new Error("Unauthorized to update this whiteboard");
    }

    const { id, ...updateFields } = args;

    const fieldsToUpdate = Object.fromEntries(
      Object.entries(updateFields).filter(([_, value]) => value !== undefined)
    );

    fieldsToUpdate.lastModifiedBy = currentUser._id;

    await ctx.db.patch(args.id, fieldsToUpdate);
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

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) throw new Error("Whiteboard not found");

    // Check permissions (same logic as your update mutation)
    const userOrgId = identity.org_id || identity.organization_id;
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      (userOrgId && whiteboard.orgId === userOrgId);

    if (!hasAccess) {
      throw new Error("You don't have permission to edit this whiteboard");
    }

    // If there's a new image, delete the old one
    if (args.imageFileId && whiteboard.imageFileId) {
      try {
        await ctx.storage.delete(whiteboard.imageFileId);
      } catch (error) {
        console.error("Failed to delete old image file:", error);
      }
    }

    // Get the image URL if imageFileId is provided
    let imageUrl: any = whiteboard.imageUrl;
    if (args.imageFileId) {
      imageUrl = await ctx.storage.getUrl(args.imageFileId);
    }

    const updateData: any = {
      lastModifiedBy: currentUser._id,
    };

    if (args.imageFileId !== undefined) {
      updateData.imageFileId = args.imageFileId;
      updateData.imageUrl = imageUrl;
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) throw new Error("Whiteboard not found");

    // Check permissions (same logic as your update mutation)
    const userOrgId = identity.org_id || identity.organization_id;
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      (userOrgId && whiteboard.orgId === userOrgId);

    if (!hasAccess) {
      throw new Error("You don't have permission to edit this whiteboard");
    }

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
      lastModifiedBy: currentUser._id,
    });

    return { success: true };
  },
});

// Get image URL (query for real-time updates)
export const getImageUrl = query({
  args: {
    fileId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.fileId);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) throw new Error("User not found");

    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) throw new Error("Whiteboard not found");

    // Check permissions
    const userOrgId = identity.org_id || identity.organization_id;
    const hasAccess =
      whiteboard.createdBy === currentUser._id ||
      (userOrgId && whiteboard.orgId === userOrgId);

    if (!hasAccess) {
      throw new Error("You don't have permission to edit this whiteboard");
    }

    const updateData: any = {
      lastModifiedBy: currentUser._id,
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

// Utility to get whiteboard with image URL resolved
export const getWithImageUrl = query({
  args: {
    id: v.id("whiteboards"),
  },
  handler: async (ctx, args) => {
    const whiteboard = await ctx.db.get(args.id);
    if (!whiteboard) return null;

    // If there's a file ID, get the current URL
    if (whiteboard.imageFileId) {
      try {
        const imageUrl = await ctx.storage.getUrl(whiteboard.imageFileId);
        return {
          ...whiteboard,
          imageUrl,
        };
      } catch (error) {
        console.error("Failed to get image URL:", error);
        // Fall back to stored URL or placeholder
      }
    }

    return whiteboard;
  },
});

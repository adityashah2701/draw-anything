import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  type AccessIdentity,
  type AccessSubject,
  canAccessWhiteboard,
  getIdentityOrgId,
} from "./accessRules";

type Ctx = QueryCtx | MutationCtx;

export interface Caller extends AccessSubject {
  userId: Id<"users">;
  user: Doc<"users">;
}

/** The signed-in caller as a `users` document, or null when anonymous/unknown. */
export const getCaller = async (ctx: Ctx): Promise<Caller | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) return null;
  return {
    user,
    userId: user._id,
    orgId: getIdentityOrgId(identity as unknown as AccessIdentity),
  };
};

export const requireCaller = async (ctx: Ctx): Promise<Caller> => {
  const caller = await getCaller(ctx);
  if (!caller) throw new Error("Unauthorized");
  return caller;
};

/** The whiteboard if the caller may use it, otherwise null (never leaks existence). */
export const getAccessibleWhiteboard = async (
  ctx: Ctx,
  caller: Caller,
  id: Id<"whiteboards">,
): Promise<Doc<"whiteboards"> | null> => {
  const whiteboard = await ctx.db.get(id);
  return whiteboard && canAccessWhiteboard(caller, whiteboard) ? whiteboard : null;
};

/** Same, for ids that arrive as plain strings (room ids, AI frame references). */
export const getAccessibleWhiteboardByRawId = async (
  ctx: Ctx,
  caller: Caller,
  rawId: string,
): Promise<Doc<"whiteboards"> | null> => {
  const id = ctx.db.normalizeId("whiteboards", rawId);
  return id ? getAccessibleWhiteboard(ctx, caller, id) : null;
};

/** Throws "Whiteboard not found" or an "Unauthorized…" error with `denied` as text. */
export const requireWhiteboardAccess = async (
  ctx: Ctx,
  caller: Caller,
  id: Id<"whiteboards">,
  denied: string,
): Promise<Doc<"whiteboards">> => {
  const whiteboard = await ctx.db.get(id);
  if (!whiteboard) throw new Error("Whiteboard not found");
  if (!canAccessWhiteboard(caller, whiteboard)) throw new Error(denied);
  return whiteboard;
};

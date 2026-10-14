/**
 * Pure authorization rules for whiteboards. No Convex imports on purpose, so the
 * rules can be unit-tested and shared by every query/mutation and by the
 * Liveblocks room check.
 *
 * Model: a whiteboard belongs to the user who created it and to one
 * organization. The creator and members of that organization may read and edit
 * it. Nobody else may see it (there is no share-link feature).
 */

export interface AccessIdentity {
  subject: string;
  org_id?: unknown;
  organization_id?: unknown;
}

export interface AccessSubject {
  /** Convex `users` document id of the caller. */
  userId: string;
  /** The caller's active organization, when the auth token carries one. */
  orgId?: string;
}

export interface WhiteboardOwnership {
  createdBy: string;
  orgId: string;
}

/**
 * The organization claim Clerk puts in the Convex JWT template (`org_id`, or
 * `organization_id` in older templates). Anything that is not a non-empty
 * string is treated as "no organization".
 */
export const getIdentityOrgId = (identity: AccessIdentity): string | undefined => {
  const value = identity.org_id ?? identity.organization_id;
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const canAccessWhiteboard = (
  subject: AccessSubject,
  whiteboard: WhiteboardOwnership,
): boolean =>
  whiteboard.createdBy === subject.userId ||
  (subject.orgId !== undefined && whiteboard.orgId === subject.orgId);

/**
 * May the caller create a whiteboard in `orgId`? When the token carries an
 * organization the requested one must match it; without a claim membership
 * cannot be verified server-side and the previous behaviour is kept.
 */
export const canCreateInOrg = (subject: AccessSubject, orgId: string): boolean =>
  subject.orgId === undefined || subject.orgId === orgId;

export interface PublicUser {
  _id: string;
  clerkId: string;
  name: string;
  imageUrl: string;
}

/**
 * What one user may learn about another: enough to render an author chip.
 * Email, plan and billing ids are only returned for the caller's own record.
 */
export const toUserView = <
  T extends PublicUser & { email: string; plan?: string; clerkSubscriptionId?: string },
>(
  user: T,
  viewerUserId: string,
): T | PublicUser =>
  user._id === viewerUserId
    ? user
    : {
        _id: user._id,
        clerkId: user.clerkId,
        name: user.name,
        imageUrl: user.imageUrl,
      };

/** Pure shapes and mapping for "workspaces you can join". No Clerk, no React: this is what the unit tests cover. */

export type PendingKind = "invitation" | "suggestion";

export interface PendingWorkspace {
  /** The invitation or suggestion id. */
  id: string;
  kind: PendingKind;
  orgId: string;
  name: string;
  imageUrl?: string;
  /** Only invitations carry a role. */
  role?: string;
  createdAt: Date;
}

interface OrgData {
  id: string;
  name: string;
  imageUrl: string;
  hasImage: boolean;
}

/** The parts of Clerk's invitation and suggestion resources this mapping reads. */
export interface InvitationLike {
  id: string;
  status: string;
  role: string;
  createdAt: Date;
  publicOrganizationData: OrgData;
}
export interface SuggestionLike {
  id: string;
  status: string;
  createdAt: Date;
  publicOrganizationData: OrgData;
}

/**
 * Pending invitations first (newest first), then suggestions. A workspace the person was both invited to and
 * is suggested keeps only the invitation, and anything they already belong to is dropped.
 */
export function toPendingWorkspaces(
  invitations: InvitationLike[],
  suggestions: SuggestionLike[],
  memberOf: ReadonlySet<string> = new Set(),
): PendingWorkspace[] {
  const out: PendingWorkspace[] = [];
  const seen = new Set<string>(memberOf);
  const byNewest = <T extends { createdAt: Date }>(list: T[]) => [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const i of byNewest(invitations)) {
    const org = i.publicOrganizationData;
    if (i.status !== "pending" || seen.has(org.id)) continue;
    seen.add(org.id);
    out.push({ id: i.id, kind: "invitation", orgId: org.id, name: org.name, imageUrl: org.hasImage ? org.imageUrl : undefined, role: i.role, createdAt: i.createdAt });
  }
  for (const s of byNewest(suggestions)) {
    const org = s.publicOrganizationData;
    if (s.status !== "pending" || seen.has(org.id)) continue;
    seen.add(org.id);
    out.push({ id: s.id, kind: "suggestion", orgId: org.id, name: org.name, imageUrl: org.hasImage ? org.imageUrl : undefined, createdAt: s.createdAt });
  }
  return out;
}

export function invitationCount(items: PendingWorkspace[]): number {
  return items.filter((i) => i.kind === "invitation").length;
}

export interface AccountEmail {
  address: string;
  verified: boolean;
}

/**
 * What the "nothing pending" state says. Clerk returns invitations only for the signed-in user's verified
 * email addresses, so name the ones being checked (and flag unverified ones) to make a missing invitation diagnosable.
 */
export function noInvitationsMessage(emails: AccountEmail[]): string {
  const verified = emails.filter((e) => e.verified).map((e) => e.address);
  const unverified = emails.filter((e) => !e.verified).map((e) => e.address);
  const base = verified.length > 0 ? `No pending invitations for ${verified.join(", ")}.` : "No pending invitations.";
  return unverified.length > 0 ? `${base} Not checked, because they are unverified: ${unverified.join(", ")}.` : base;
}

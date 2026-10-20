import { describe, expect, it } from "vitest";
import { invitationCount, noInvitationsMessage, toPendingWorkspaces, type InvitationLike, type SuggestionLike } from "./invitations-model";

const org = (id: string, name = id, hasImage = false) => ({ id, name, imageUrl: `https://img/${id}`, hasImage });
const inv = (id: string, orgId: string, over: Partial<InvitationLike> = {}): InvitationLike => ({
  id,
  status: "pending",
  role: "org:member",
  createdAt: new Date(2026, 9, 20),
  publicOrganizationData: org(orgId),
  ...over,
});
const sug = (id: string, orgId: string, over: Partial<SuggestionLike> = {}): SuggestionLike => ({
  id,
  status: "pending",
  createdAt: new Date(2026, 9, 20),
  publicOrganizationData: org(orgId),
  ...over,
});

describe("toPendingWorkspaces", () => {
  it("lists pending invitations newest first, then suggestions", () => {
    const list = toPendingWorkspaces(
      [inv("i1", "a", { createdAt: new Date(2026, 9, 1) }), inv("i2", "b", { createdAt: new Date(2026, 9, 10) })],
      [sug("s1", "c")],
    );
    expect(list.map((p) => `${p.kind}:${p.id}`)).toEqual(["invitation:i2", "invitation:i1", "suggestion:s1"]);
  });
  it("ignores anything that is no longer pending", () => {
    expect(toPendingWorkspaces([inv("i1", "a", { status: "accepted" }), inv("i2", "b", { status: "revoked" })], [sug("s1", "c", { status: "accepted" })])).toEqual([]);
  });
  it("drops workspaces the person already belongs to, and suggestions that duplicate an invitation", () => {
    const list = toPendingWorkspaces([inv("i1", "a"), inv("i2", "b")], [sug("s1", "b"), sug("s2", "c")], new Set(["a"]));
    expect(list.map((p) => p.id)).toEqual(["i2", "s2"]);
  });
  it("keeps a role on invitations only, and the image only when there is one", () => {
    const [i, s] = toPendingWorkspaces([{ ...inv("i1", "a"), publicOrganizationData: org("a", "A", true) }], [sug("s1", "b")]);
    expect(i).toMatchObject({ role: "org:member", imageUrl: "https://img/a" });
    expect(s.role).toBeUndefined();
    expect(s.imageUrl).toBeUndefined();
  });
  it("counts invitations apart from suggestions", () => {
    expect(invitationCount(toPendingWorkspaces([inv("i1", "a")], [sug("s1", "b")]))).toBe(1);
  });
});

describe("noInvitationsMessage", () => {
  it("names the addresses that were checked", () => {
    expect(noInvitationsMessage([{ address: "a@x.co", verified: true }, { address: "b@x.co", verified: true }])).toBe("No pending invitations for a@x.co, b@x.co.");
  });
  it("flags addresses Clerk would not match because they are unverified", () => {
    expect(noInvitationsMessage([{ address: "a@x.co", verified: true }, { address: "b@x.co", verified: false }])).toBe(
      "No pending invitations for a@x.co. Not checked, because they are unverified: b@x.co.",
    );
  });
  it("copes with no verified address at all", () => {
    expect(noInvitationsMessage([{ address: "b@x.co", verified: false }])).toContain("unverified: b@x.co");
    expect(noInvitationsMessage([])).toBe("No pending invitations.");
  });
});

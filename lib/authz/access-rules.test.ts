import { describe, expect, it } from "vitest";
import {
  canAccessWhiteboard,
  canCreateInOrg,
  getIdentityOrgId,
  toUserView,
} from "../../convex/lib/accessRules";

const board = { createdBy: "u_owner", orgId: "org_a" };

describe("getIdentityOrgId", () => {
  it("reads org_id, then organization_id", () => {
    expect(getIdentityOrgId({ subject: "s", org_id: "org_a" })).toBe("org_a");
    expect(getIdentityOrgId({ subject: "s", organization_id: "org_b" })).toBe("org_b");
    expect(
      getIdentityOrgId({ subject: "s", org_id: "org_a", organization_id: "org_b" }),
    ).toBe("org_a");
  });

  it.each([undefined, null, "", 0, 42, {}, []])(
    "treats %j as no organization",
    (value) => {
      expect(getIdentityOrgId({ subject: "s", org_id: value })).toBeUndefined();
    },
  );
});

describe("canAccessWhiteboard", () => {
  it("allows the creator, with or without an organization", () => {
    expect(canAccessWhiteboard({ userId: "u_owner" }, board)).toBe(true);
    expect(canAccessWhiteboard({ userId: "u_owner", orgId: "org_z" }, board)).toBe(true);
  });

  it("allows members of the whiteboard's organization", () => {
    expect(canAccessWhiteboard({ userId: "u_other", orgId: "org_a" }, board)).toBe(true);
  });

  it("denies everyone else", () => {
    expect(canAccessWhiteboard({ userId: "u_other" }, board)).toBe(false);
    expect(canAccessWhiteboard({ userId: "u_other", orgId: "org_b" }, board)).toBe(false);
  });

  it("never matches an undefined org against a whiteboard org", () => {
    // Guards against `undefined === undefined`-style accidents.
    expect(
      canAccessWhiteboard({ userId: "u_other", orgId: undefined }, {
        createdBy: "u_owner",
        orgId: undefined as unknown as string,
      }),
    ).toBe(false);
  });
});

describe("canCreateInOrg", () => {
  it("requires the requested org to match the token's organization", () => {
    expect(canCreateInOrg({ userId: "u", orgId: "org_a" }, "org_a")).toBe(true);
    expect(canCreateInOrg({ userId: "u", orgId: "org_a" }, "org_b")).toBe(false);
  });

  it("keeps the previous behaviour when the token has no organization claim", () => {
    expect(canCreateInOrg({ userId: "u" }, "org_x")).toBe(true);
  });
});

describe("toUserView", () => {
  const user = {
    _id: "u1",
    clerkId: "user_1",
    name: "Ada",
    imageUrl: "https://img",
    email: "ada@example.com",
    plan: "pro",
    clerkSubscriptionId: "sub_1",
  };

  it("returns the full record to its owner", () => {
    expect(toUserView(user, "u1")).toEqual(user);
  });

  it("returns only the public fields to everyone else", () => {
    const view = toUserView(user, "u2");
    expect(view).toEqual({
      _id: "u1",
      clerkId: "user_1",
      name: "Ada",
      imageUrl: "https://img",
    });
    expect(view).not.toHaveProperty("email");
    expect(view).not.toHaveProperty("plan");
    expect(view).not.toHaveProperty("clerkSubscriptionId");
  });
});

import { describe, expect, it } from "vitest";
import {
  filterMembers,
  initials,
  parseEmails,
  roleLabel,
  summary,
  timeAgo,
  errorMessage,
  displayName,
  type TeamMember,
} from "./team-model";

const member = (name: string, email: string): TeamMember => ({
  id: name,
  userId: name,
  name,
  email,
  role: "org:member",
  joinedAt: new Date(0),
});

describe("parseEmails", () => {
  it("splits on commas, semicolons, spaces and newlines", () => {
    expect(parseEmails("a@x.co, b@x.co;c@x.co\nd@x.co e@x.co").valid).toEqual(["a@x.co", "b@x.co", "c@x.co", "d@x.co", "e@x.co"]);
  });
  it("drops duplicates regardless of case and reports invalid entries", () => {
    const r = parseEmails("A@x.co a@x.co nope b@x");
    expect(r.valid).toEqual(["A@x.co"]);
    expect(r.invalid).toEqual(["nope", "b@x"]);
  });
  it("accepts an address pasted from a mail client", () => {
    expect(parseEmails("Ada <ada@x.co>").valid).toEqual(["ada@x.co"]);
  });
  it("returns nothing for blank input", () => {
    expect(parseEmails("  \n ")).toEqual({ valid: [], invalid: [] });
  });
});

describe("roleLabel", () => {
  it("names the built-in roles", () => {
    expect(roleLabel("org:admin")).toBe("Admin");
    expect(roleLabel("org:member")).toBe("Member");
  });
  it("uses Clerk's name for a custom role, or derives one from the key", () => {
    expect(roleLabel("org:designer", "Designer")).toBe("Designer");
    expect(roleLabel("org:billing_manager")).toBe("Billing manager");
  });
});

describe("filterMembers", () => {
  const list = [member("Ada Lovelace", "ada@x.co"), member("Grace Hopper", "grace@navy.mil")];
  it("matches name or email, ignoring case", () => {
    expect(filterMembers(list, "NAVY").map((m) => m.name)).toEqual(["Grace Hopper"]);
    expect(filterMembers(list, "love").map((m) => m.name)).toEqual(["Ada Lovelace"]);
  });
  it("returns everyone for an empty query", () => {
    expect(filterMembers(list, "  ")).toHaveLength(2);
  });
});

describe("small formatters", () => {
  it("builds initials from a name or an email", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("grace@navy.mil")).toBe("GR");
    expect(initials("")).toBe("?");
  });
  it("builds a display name with a fallback", () => {
    expect(displayName("Ada", null, "ada@x.co")).toBe("Ada");
    expect(displayName(null, null, "ada@x.co")).toBe("ada@x.co");
  });
  it("describes elapsed time", () => {
    const now = Date.UTC(2026, 9, 20, 12);
    expect(timeAgo(new Date(now - 10_000), now)).toBe("just now");
    expect(timeAgo(new Date(now - 5 * 60_000), now)).toBe("5m ago");
    expect(timeAgo(new Date(now - 3 * 3_600_000), now)).toBe("3h ago");
    expect(timeAgo(new Date(now - 2 * 86_400_000), now)).toBe("2d ago");
  });
  it("summarises members and pending invitations", () => {
    expect(summary(1, 0)).toBe("1 member");
    expect(summary(4, 2)).toBe("4 members · 2 pending");
  });
  it("reads Clerk's long message when present", () => {
    expect(errorMessage({ errors: [{ longMessage: "You can't remove the last admin." }] }, "x")).toBe("You can't remove the last admin.");
    expect(errorMessage(undefined, "Could not do it")).toBe("Could not do it");
  });
});

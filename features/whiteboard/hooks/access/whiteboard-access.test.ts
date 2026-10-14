import { describe, expect, it } from "vitest";
import { resolveWhiteboardAccess } from "./whiteboard-access";

describe("resolveWhiteboardAccess", () => {
  it("never grants edit rights while loading", () => {
    expect(resolveWhiteboardAccess(undefined)).toEqual({
      status: "loading",
      hasEditAccess: false,
    });
  });

  it("denies when the server returned nothing for this user", () => {
    expect(resolveWhiteboardAccess(null)).toEqual({
      status: "denied",
      hasEditAccess: false,
    });
  });

  it("grants when the server returned the whiteboard", () => {
    expect(resolveWhiteboardAccess({ _id: "x", orgId: "org" })).toEqual({
      status: "granted",
      hasEditAccess: true,
    });
  });
});

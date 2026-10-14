import { describe, expect, it, vi } from "vitest";
import { InvalidRoomError, decideRoomAccess } from "./room-access";

const allow = vi.fn(async () => ({ canEdit: true }));

describe("decideRoomAccess", () => {
  it("rejects anonymous callers before touching the database", async () => {
    const checkAccess = vi.fn(allow);
    for (const userId of [null, undefined, ""]) {
      expect(await decideRoomAccess({ userId, room: "abc", checkAccess })).toMatchObject({
        ok: false,
        status: 401,
      });
    }
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, {}, "", "a b", "../x", "x".repeat(129), "room/../../1"])(
    "rejects the malformed room %j with 400 without a lookup",
    async (room) => {
      const checkAccess = vi.fn(allow);
      expect(await decideRoomAccess({ userId: "u", room, checkAccess })).toMatchObject({
        ok: false,
        status: 400,
      });
      expect(checkAccess).not.toHaveBeenCalled();
    },
  );

  it("allows a room the database says the user can access", async () => {
    expect(
      await decideRoomAccess({ userId: "u", room: "k17abc_DEF-9", checkAccess: allow }),
    ).toEqual({ ok: true, room: "k17abc_DEF-9" });
  });

  it.each([null, undefined, false, 0])(
    "denies with 403 when the lookup returns %j (missing or not theirs)",
    async (value) => {
      expect(
        await decideRoomAccess({
          userId: "u",
          room: "abc",
          checkAccess: async () => value,
        }),
      ).toMatchObject({ ok: false, status: 403 });
    },
  );

  it("treats an id the database rejects as no access (403), not an error", async () => {
    expect(
      await decideRoomAccess({
        userId: "u",
        room: "not-a-convex-id",
        checkAccess: async () => {
          throw new InvalidRoomError();
        },
      }),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed with 503 when the access check itself breaks", async () => {
    const decision = await decideRoomAccess({
      userId: "u",
      room: "abc",
      checkAccess: async () => {
        throw new Error("convex unreachable");
      },
    });
    expect(decision).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(decision)).not.toContain("convex unreachable");
  });
});

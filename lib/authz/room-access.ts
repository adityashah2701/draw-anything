export type RoomDecision =
  | { ok: true; room: string }
  | { ok: false; status: 400 | 401 | 403 | 503; message: string };

const ROOM_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Decide whether a signed-in user may join a realtime room. Room ids are
 * whiteboard ids, so access is whatever the database says about that
 * whiteboard. The decision fails closed: if the check itself cannot be made
 * the answer is "no" (503, retryable), never "yes".
 *
 * `checkAccess` resolves to a truthy value when the user may join, and to a
 * falsy one when the whiteboard does not exist or belongs to someone else.
 * It may throw `InvalidRoomError` for ids the database rejects outright.
 */
export class InvalidRoomError extends Error {
  constructor() {
    super("Invalid room id");
    this.name = "InvalidRoomError";
  }
}

export const decideRoomAccess = async ({
  userId,
  room,
  checkAccess,
}: {
  userId: string | null | undefined;
  room: unknown;
  checkAccess: (room: string) => Promise<unknown>;
}): Promise<RoomDecision> => {
  if (!userId) {
    return { ok: false, status: 401, message: "Sign in to join this whiteboard." };
  }
  if (typeof room !== "string" || !ROOM_ID.test(room)) {
    return { ok: false, status: 400, message: "A valid room id is required." };
  }

  let allowed: unknown;
  try {
    allowed = await checkAccess(room);
  } catch (error) {
    if (error instanceof InvalidRoomError) {
      return { ok: false, status: 403, message: "You don't have access to this whiteboard." };
    }
    return { ok: false, status: 503, message: "Unable to verify access right now. Please retry." };
  }

  return allowed
    ? { ok: true, room }
    : { ok: false, status: 403, message: "You don't have access to this whiteboard." };
};

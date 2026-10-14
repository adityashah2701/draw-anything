import { Liveblocks } from "@liveblocks/node";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InvalidRoomError, decideRoomAccess } from "@/lib/authz/room-access";

// Prerendering imports this module, so the secret is read per request rather
// than at import time.
const getLiveblocks = () => {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing LIVEBLOCKS_SECRET_KEY from environment variables.");
  }
  return new Liveblocks({ secret });
};

const text = (status: number, message: string) =>
  new Response(message, { status });

export async function POST(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return text(401, "Unauthorized");
  }

  let room: unknown;
  try {
    room = (await request.json())?.room;
  } catch {
    return text(400, "A valid room id is required.");
  }

  // A room is a whiteboard. Ask Convex, as this user, whether they may use it.
  const decision = await decideRoomAccess({
    userId,
    room,
    checkAccess: async (roomId) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("No Convex token for this session");
      const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
      convex.setAuth(token);
      try {
        return await convex.query(api.whiteboard.getAccess, {
          id: roomId as Id<"whiteboards">,
        });
      } catch (error) {
        if (/ArgumentValidationError|Invalid argument|Unable to decode/i.test(String(error))) {
          throw new InvalidRoomError();
        }
        throw error;
      }
    },
  });
  if (!decision.ok) {
    return text(decision.status, decision.message);
  }

  const user = await currentUser();
  if (!user) {
    return text(401, "Unauthorized");
  }

  const session = getLiveblocks().prepareSession(user.id, {
    userInfo: {
      name: user.firstName
        ? `${user.firstName} ${user.lastName || ""}`.trim()
        : "Anonymous",
      pictureUrl: user.imageUrl,
    },
  });
  session.allow(decision.room, session.FULL_ACCESS);

  const { status, body } = await session.authorize();
  return new Response(body, { status });
}

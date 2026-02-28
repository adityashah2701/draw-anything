import { Liveblocks } from "@liveblocks/node";
import { auth, currentUser } from "@clerk/nextjs/server";

// Verify secret key exist
const authSecret = process.env.LIVEBLOCKS_SECRET_KEY as string;

if (!authSecret) {
  throw new Error("Missing LIVEBLOCKS_SECRET_KEY from environment variables.");
}

const liveblocks = new Liveblocks({
  secret: authSecret,
});

export async function POST(request: Request) {
  // Get the current user from your auth provider
  const user = await currentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Get requested room
  const body = await request.json();
  const room = body.room;

  // We construct the user info based on Clerk User
  const userInfo = {
    name: user.firstName
      ? `${user.firstName} ${user.lastName || ""}`
      : "Anonymous",
    pictureUrl: user.imageUrl,
  };

  // Start an auth session inside your endpoint
  // Give this user access to the requested room
  const session = liveblocks.prepareSession(user.id, {
    userInfo: userInfo,
  });

  // Give the user access to the requested room
  session.allow(room, session.FULL_ACCESS);

  const { status, body: authBody } = await session.authorize();

  return new Response(authBody, { status });
}

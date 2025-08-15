import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!SIGNING_SECRET) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET");
  }

  // Retrieve headers for signature verification
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Missing webhook headers", { status: 400 });
  }

  // Get request body as text
  const payload = await req.text();
  const body = payload;

  // Verify with svix
  const wh = new Webhook(SIGNING_SECRET);
  let evt: any;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  // Example: User created/updated events
  const { type, data } = evt;

  if (type === "user.created") {
    await convex.mutation(api.users.createUser, {
      clerkId: data.id,
      email: data.email_addresses[0]?.email_address,
      name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
      imageUrl: data.image_url,
    });
  }

  if (type === "user.deleted") {
    await convex.mutation(api.users.deleteUser, { clerkId: data.id });
  }

  return new NextResponse("Webhook processed", { status: 200 });
}

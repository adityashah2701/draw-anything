import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("Missing CLERK_WEBHOOK_SECRET");
    }

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing webhook headers", { status: 400 });
    }

    let evt: WebhookEvent;
    try {
      evt = new Webhook(secret).verify(await req.text(), {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    const { type, data } = evt;

    if (type === "user.created") {
      await ctx.runMutation(internal.users.createUser, {
        clerkId: data.id,
        email: data.email_addresses[0]?.email_address || "",
        name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
        imageUrl: data.image_url || "",
        plan: "free",
      });
    }

    if (type === "user.deleted" && data.id) {
      await ctx.runMutation(internal.users.deleteUser, { clerkId: data.id });
    }

    // Clerk Payments subscription events: any active subscription = pro
    if (type === "subscription.created" || type === "subscription.updated") {
      const subData = data as { status?: string; user_id?: string; id: string };
      if (subData.user_id) {
        await ctx.runMutation(internal.users.updateSubscription, {
          clerkId: subData.user_id,
          plan: subData.status === "active" ? "pro" : "free",
          clerkSubscriptionId: subData.id,
        });
      }
    }

    if ((type as string) === "subscription.canceled") {
      const subData = data as { user_id?: string };
      if (subData.user_id) {
        await ctx.runMutation(internal.users.updateSubscription, {
          clerkId: subData.user_id,
          plan: "free",
        });
      }
    }

    return new Response("Webhook processed", { status: 200 });
  }),
});

export default http;

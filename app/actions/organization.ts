"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export async function createCustomOrganization(name: string) {
  const { userId, getToken } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Read the caller's own record with the caller's own Convex token. The client
  // is created per call: setAuth() on a shared instance would let concurrent
  // requests borrow each other's identity.
  const token = await getToken({ template: "convex" });
  if (!token) {
    throw new Error("Unauthorized");
  }
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(token);

  // Get user from Convex to check their plan
  const user = await convex.query(api.users.getCurrentUser, {});
  if (!user) {
    throw new Error("User not found in database");
  }

  const client = await clerkClient();

  // Get user's existing organizations
  const memberships = await client.users.getOrganizationMembershipList({
    userId,
  });

  const orgCount = memberships.data.length;

  // Enforce limit: Free = 1, Pro = Unlimited
  const plan = user.plan || "free";
  if (plan === "free" && orgCount >= 1) {
    throw new Error(
      "Free plan users can only create 1 organization. Please upgrade to Pro.",
    );
  }

  // Create organization
  const org = await client.organizations.createOrganization({
    name,
    createdBy: userId,
  });

  return { success: true, organization: JSON.parse(JSON.stringify(org)) };
}

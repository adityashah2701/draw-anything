"use client";

import * as React from "react";
import { useOrganizationList } from "@clerk/nextjs";

import { toPendingWorkspaces, type PendingWorkspace } from "./invitations-model";

/**
 * Workspaces the signed-in person has been invited to, or that Clerk suggests from their email domain.
 * `accept` joins (or, for a suggestion, asks to join) and, for an invitation, makes that workspace the active one.
 */
export function usePendingWorkspaces() {
  const { isLoaded, setActive, userMemberships, userInvitations, userSuggestions } = useOrganizationList({
    userMemberships: { infinite: true, keepPreviousData: true },
    userInvitations: { infinite: true, keepPreviousData: true, status: "pending" },
    userSuggestions: { infinite: true, keepPreviousData: true, status: "pending" },
  });

  const items = React.useMemo(
    () =>
      toPendingWorkspaces(
        userInvitations.data ?? [],
        userSuggestions.data ?? [],
        new Set((userMemberships.data ?? []).map((m) => m.organization.id)),
      ),
    [userInvitations.data, userSuggestions.data, userMemberships.data],
  );

  const accept = React.useCallback(
    async (item: PendingWorkspace) => {
      if (item.kind === "invitation") {
        const invitation = userInvitations.data?.find((i) => i.id === item.id);
        if (!invitation) throw new Error("This invitation is no longer available.");
        await invitation.accept();
        // The new membership has to exist before the workspace can be made active.
        await Promise.all([userMemberships.revalidate?.(), userInvitations.revalidate?.()]);
        await setActive?.({ organization: item.orgId });
        return;
      }
      const suggestion = userSuggestions.data?.find((s) => s.id === item.id);
      if (!suggestion) throw new Error("This suggestion is no longer available.");
      await suggestion.accept();
      await Promise.all([userSuggestions.revalidate?.(), userMemberships.revalidate?.()]);
    },
    [userInvitations, userSuggestions, userMemberships, setActive],
  );

  return { isLoaded, items, accept };
}

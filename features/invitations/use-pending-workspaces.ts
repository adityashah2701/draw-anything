"use client";

import * as React from "react";
import { useOrganizationList, useUser } from "@clerk/nextjs";

import { errorMessage } from "@/features/team/team-model";
import { noInvitationsMessage, toPendingWorkspaces, type PendingWorkspace } from "./invitations-model";

/** Clerk caches these lists for a minute and revalidates on focus at most every two minutes, so ask again when the tab comes back. */
const FOCUS_REFRESH_MS = 15_000;

/**
 * Workspaces the signed-in person has been invited to, or that Clerk suggests from their email domain.
 * `accept` joins (or, for a suggestion, asks to join) and, for an invitation, makes that workspace the active one.
 */
export function usePendingWorkspaces({ refreshOnFocus = false }: { refreshOnFocus?: boolean } = {}) {
  const { user } = useUser();
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

  const revalidateInvitations = userInvitations.revalidate;
  const revalidateSuggestions = userSuggestions.revalidate;
  const refresh = React.useCallback(
    () => Promise.all([revalidateInvitations?.(), revalidateSuggestions?.()]).then(() => undefined, () => undefined),
    [revalidateInvitations, revalidateSuggestions],
  );

  // A new invitation does not announce itself: look again whenever the person returns to the tab.
  const lastRefresh = React.useRef(0);
  React.useEffect(() => {
    if (!refreshOnFocus) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh.current < FOCUS_REFRESH_MS) return;
      lastRefresh.current = Date.now();
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshOnFocus, refresh]);

  const emails = (user?.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === "verified" }));
  const failure = userInvitations.error ?? userSuggestions.error;
  const message = failure ? `Could not check for invitations: ${errorMessage(failure, "try again")}` : noInvitationsMessage(emails);

  return {
    isLoaded,
    items,
    accept,
    refresh,
    /** True while Clerk is fetching, so "Check again" can say so. */
    checking: !!(userInvitations.isFetching || userSuggestions.isFetching),
    /** The text for the "nothing pending" state. */
    message,
    failed: !!failure,
  };
}

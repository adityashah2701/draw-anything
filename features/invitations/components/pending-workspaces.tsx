"use client";

import { InvitationsNotice } from "./invitations-notice";
import { usePendingWorkspaces } from "../use-pending-workspaces";

/** Clerk-connected `InvitationsNotice`. Accepting makes the new workspace active, so the surrounding page re-renders into it. */
export function PendingWorkspaces({ className, showEmpty = false }: { className?: string; showEmpty?: boolean }) {
  const { items, accept, refresh, checking, message } = usePendingWorkspaces({ refreshOnFocus: showEmpty });
  return <InvitationsNotice items={items} onAccept={accept} empty={showEmpty ? { message, checking, onRefresh: refresh } : undefined} className={className} />;
}

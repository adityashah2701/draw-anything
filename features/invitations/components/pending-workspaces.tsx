"use client";

import { InvitationsNotice } from "./invitations-notice";
import { usePendingWorkspaces } from "../use-pending-workspaces";

/** Clerk-connected `InvitationsNotice`. Accepting makes the new workspace active, so the surrounding page re-renders into it. */
export function PendingWorkspaces({ className }: { className?: string }) {
  const { items, accept } = usePendingWorkspaces();
  return <InvitationsNotice items={items} onAccept={accept} className={className} />;
}

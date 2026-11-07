"use client";

import * as React from "react";
import { Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptySheet } from "@/components/shared/empty-sheet";
import { SectionLabel } from "@/components/shared/section-label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROLES,
  filterMembers,
  summary,
  type TeamMember,
} from "../team-model";
import { ConfirmDialog } from "./confirm-dialog";
import { InviteDialog } from "./invite-dialog";
import { InviteRow } from "./invite-row";
import { MemberRow } from "./member-row";
import { MemberSkeleton } from "./member-skeleton";
import { RequestRow } from "./request-row";
import { WorkspaceSection } from "./workspace-section";
import type { TeamActions, TeamViewProps, TeamWorkspace } from "./team-types";

export type { TeamActions, TeamViewProps, TeamWorkspace };

const SEARCH_THRESHOLD = 6;

/**
 * Members, invitations and workspace settings on one page. Inviting is the primary action and sits in the
 * header; everything else is a quiet list below it, in the product's own components rather than Clerk's.
 */
export function TeamView({
  workspace,
  members,
  invites,
  requests = [],
  roles = DEFAULT_ROLES,
  currentUserId,
  canManage,
  loading,
  hasMoreMembers,
  startInviting,
  actions,
  className,
}: TeamViewProps) {
  const [inviteOpen, setInviteOpen] = React.useState(!!startInviting && canManage);
  const [query, setQuery] = React.useState("");
  const [removing, setRemoving] = React.useState<TeamMember | null>(null);
  const shown = filterMembers(members, query);
  const alone = !loading && members.length <= 1 && invites.length === 0;

  return (
    <div className={cn("mx-auto w-full max-w-3xl space-y-10 px-4 py-8 sm:px-8 sm:py-10", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{workspace.name}</h1>
          <p className="label-mono">{loading ? "Loading members" : summary(members.length, invites.length + requests.length)}</p>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invite people
          </Button>
        ) : (
          <p className="label-mono">Admins manage members</p>
        )}
      </header>

      <section aria-labelledby="members-heading" className="space-y-4">
        <SectionLabel
          title={<span id="members-heading">Members</span>}
          action={
            members.length > SEARCH_THRESHOLD ? (
              <div className="relative -my-2 w-40 sm:w-56">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a member"
                  aria-label="Find a member"
                  className="h-8 pl-8 text-xs md:text-xs"
                />
              </div>
            ) : undefined
          }
        />
        {loading ? (
          <MemberSkeleton />
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {shown.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  roles={roles}
                  isYou={member.userId === currentUserId}
                  canManage={canManage}
                  onChangeRole={actions.changeRole}
                  onRemove={() => setRemoving(member)}
                />
              ))}
              {shown.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No one matches “{query}”.</li>}
            </ul>
            {hasMoreMembers && actions.loadMore && (
              <Button variant="ghost" size="sm" onClick={actions.loadMore}>
                Show more
              </Button>
            )}
          </>
        )}
      </section>

      {canManage && requests.length > 0 && actions.approveRequest && actions.rejectRequest && (
        <section aria-labelledby="requests-heading" className="space-y-4">
          <SectionLabel title={<span id="requests-heading">Requests to join</span>} />
          <ul className="divide-y overflow-hidden rounded-lg border border-primary/40 bg-card">
            {requests.map((request) => (
              <RequestRow key={request.id} request={request} onApprove={actions.approveRequest!} onReject={actions.rejectRequest!} />
            ))}
          </ul>
        </section>
      )}

      {canManage && invites.length > 0 && (
        <section aria-labelledby="pending-heading" className="space-y-4">
          <SectionLabel title={<span id="pending-heading">Pending invitations</span>} />
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} roles={roles} onRevoke={actions.revokeInvite} />
            ))}
          </ul>
        </section>
      )}

      {canManage && alone && (
        <EmptySheet title="Just you for now" description="Invite teammates by email. They join with the role you choose, and the invitation waits here until they accept.">
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invite people
          </Button>
        </EmptySheet>
      )}

      <WorkspaceSection workspace={workspace} canManage={canManage} actions={actions} />

      {canManage && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          roles={roles}
          existingEmails={[...members.map((m) => m.email), ...invites.map((i) => i.email)]}
          onInvite={actions.invite}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "member"}?`}
        description={`They lose access to ${workspace.name} and its whiteboards. You can invite them again later.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing) await actions.removeMember(removing);
        }}
        successMessage="Member removed"
        failureMessage="Could not remove the member"
      />
    </div>
  );
}

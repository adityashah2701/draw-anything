"use client";

import * as React from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/shared/section-label";
import { cn } from "@/lib/utils";
import { errorMessage, initials, roleLabel, timeAgo } from "@/features/team/team-model";
import type { PendingWorkspace } from "../invitations-model";

interface InvitationsNoticeProps {
  items: PendingWorkspace[];
  /** Resolves once Clerk has accepted; rejects with Clerk's error. */
  onAccept: (item: PendingWorkspace) => Promise<void>;
  /** When given and nothing is pending, say so (and offer to look again) instead of rendering nothing. */
  empty?: { message: string; checking: boolean; onRefresh: () => void };
  className?: string;
}

/**
 * Pending invitations (and domain suggestions) for the signed-in person, shown where they land: the dashboard
 * and the "no workspace" screen. Renders nothing when there is nothing to answer.
 */
export function InvitationsNotice({ items, onAccept, empty, className }: InvitationsNoticeProps) {
  const [busy, setBusy] = React.useState<string | null>(null);
  if (items.length === 0) {
    if (!empty) return null;
    return (
      <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border bg-card px-4 py-3", className)}>
        <p role="status" className="min-w-0 flex-1 text-sm text-muted-foreground">
          {empty.checking ? "Checking for invitations…" : empty.message}
        </p>
        <Button variant="outline" size="sm" onClick={empty.onRefresh} disabled={empty.checking}>
          Check again
        </Button>
      </div>
    );
  }

  const accept = async (item: PendingWorkspace) => {
    setBusy(item.id);
    try {
      await onAccept(item);
      toast.success(item.kind === "invitation" ? `You joined ${item.name}` : `Request sent to ${item.name}`);
    } catch (error) {
      toast.error(errorMessage(error, item.kind === "invitation" ? "Could not accept the invitation" : "Could not send the request"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="invitations-heading" className={cn("space-y-3", className)}>
      <SectionLabel title={<span id="invitations-heading">{items.some((i) => i.kind === "invitation") ? "Invitations" : "Workspaces you can join"}</span>} />
      <ul className="divide-y overflow-hidden rounded-lg border border-primary/40 bg-card">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Avatar aria-hidden className="size-8 rounded-md">
              {item.imageUrl && <AvatarImage src={item.imageUrl} alt="" />}
              <AvatarFallback className="rounded-md bg-muted font-mono text-[11px] font-semibold text-muted-foreground">{initials(item.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-tight font-medium">{item.name}</p>
              <p className="label-mono mt-1.5 truncate">
                {item.kind === "invitation" ? `Invited as ${roleLabel(item.role ?? "org:member")} · ${timeAgo(item.createdAt)}` : "Your email domain"}
              </p>
            </div>
            <Button
              size="sm"
              variant={item.kind === "invitation" ? "default" : "outline"}
              disabled={busy !== null}
              onClick={() => accept(item)}
              aria-label={`${item.kind === "invitation" ? "Accept invitation to" : "Request to join"} ${item.name}`}
              className="shrink-0"
            >
              {busy === item.id ? "Working…" : item.kind === "invitation" ? "Accept" : "Request to join"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

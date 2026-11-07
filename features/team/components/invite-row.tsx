import * as React from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  errorMessage,
  roleLabel,
  timeAgo,
  type TeamInvite,
  type TeamRole,
} from "../team-model";

export function InviteRow({
  invite,
  roles,
  onRevoke,
}: {
  invite: TeamInvite;
  roles: TeamRole[];
  onRevoke: (invite: TeamInvite) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const revoke = async () => {
    setBusy(true);
    try {
      await onRevoke(invite);
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error(errorMessage(error, "Could not revoke the invitation"));
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
        <Mail className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{invite.email}</p>
        <p className="label-mono mt-1.5">
          {roleLabel(invite.role, invite.roleName, roles)} · Sent {timeAgo(invite.createdAt)}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={revoke} disabled={busy} className="-mr-1 shrink-0 text-muted-foreground hover:text-destructive">
        {busy ? "Revoking…" : "Revoke"}
      </Button>
    </li>
  );
}


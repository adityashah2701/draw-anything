import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  errorMessage,
  timeAgo,
  type TeamRequest,
} from "../team-model";
import { PersonAvatar } from "./person-avatar";

export function RequestRow({
  request,
  onApprove,
  onReject,
}: {
  request: TeamRequest;
  onApprove: (request: TeamRequest) => Promise<void>;
  onReject: (request: TeamRequest) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const answer = async (action: (request: TeamRequest) => Promise<void>, done: string, failed: string) => {
    setBusy(true);
    try {
      await action(request);
      toast.success(done);
    } catch (error) {
      toast.error(errorMessage(error, failed));
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <PersonAvatar name={request.name} imageUrl={request.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{request.name}</p>
        <p className="label-mono mt-1.5 truncate">
          {request.email} · Asked {timeAgo(request.createdAt)}
        </p>
      </div>
      <Button variant="ghost" size="sm" disabled={busy} className="shrink-0 text-muted-foreground" onClick={() => answer(onReject, "Request declined", "Could not decline the request")}>
        Decline
      </Button>
      <Button size="sm" disabled={busy} className="shrink-0" onClick={() => answer(onApprove, `${request.name} joined`, "Could not approve the request")}>
        Approve
      </Button>
    </li>
  );
}


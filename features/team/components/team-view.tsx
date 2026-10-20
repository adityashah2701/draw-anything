"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Mail, MoreHorizontal, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptySheet } from "@/components/shared/empty-sheet";
import { SectionLabel } from "@/components/shared/section-label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROLES,
  errorMessage,
  filterMembers,
  initials,
  parseEmails,
  roleLabel,
  shortDate,
  summary,
  timeAgo,
  type TeamInvite,
  type TeamMember,
  type TeamRequest,
  type TeamRole,
} from "../team-model";

export interface TeamWorkspace {
  name: string;
  imageUrl?: string;
  hasImage: boolean;
}

/** Every mutation resolves when Clerk has accepted it and rejects with Clerk's error. The view owns busy state and toasts. */
export interface TeamActions {
  invite: (emails: string[], role: string) => Promise<void>;
  changeRole: (member: TeamMember, role: string) => Promise<void>;
  removeMember: (member: TeamMember) => Promise<void>;
  revokeInvite: (invite: TeamInvite) => Promise<void>;
  approveRequest?: (request: TeamRequest) => Promise<void>;
  rejectRequest?: (request: TeamRequest) => Promise<void>;
  rename: (name: string) => Promise<void>;
  setLogo: (file: File | null) => Promise<void>;
  leave: () => Promise<void>;
  /** Present only when the workspace allows admins to delete it. */
  deleteWorkspace?: () => Promise<void>;
  /** Clerk's own settings (verified domains, join requests) for anything this page does not rebuild. */
  openAdvanced?: () => void;
  loadMore?: () => void;
}

export interface TeamViewProps {
  workspace: TeamWorkspace;
  members: TeamMember[];
  invites: TeamInvite[];
  /** People waiting for an admin to let them in. */
  requests?: TeamRequest[];
  roles?: TeamRole[];
  currentUserId?: string;
  /** Can invite, change roles, remove people and edit the workspace. */
  canManage: boolean;
  loading?: boolean;
  hasMoreMembers?: boolean;
  /** Opens the invite dialog on mount, e.g. when arriving from "Invite people" on the dashboard. */
  startInviting?: boolean;
  actions: TeamActions;
  className?: string;
}

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

// ── people ──────────────────────────────────────────────────────────────────────────────────────────

function PersonAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string; className?: string }) {
  return (
    <Avatar aria-hidden className={cn("size-8", className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" />}
      <AvatarFallback className="bg-muted font-mono text-[11px] font-medium text-muted-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function MemberRow({
  member,
  roles,
  isYou,
  canManage,
  onChangeRole,
  onRemove,
}: {
  member: TeamMember;
  roles: TeamRole[];
  isYou: boolean;
  canManage: boolean;
  onChangeRole: (member: TeamMember, role: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const label = roleLabel(member.role, member.roleName, roles);

  const changeRole = async (role: string) => {
    if (role === member.role) return;
    setBusy(true);
    try {
      await onChangeRole(member, role);
      toast.success(`${member.name} is now ${roleLabel(role, undefined, roles).toLowerCase()}`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not change the role"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <PersonAvatar name={member.name} imageUrl={member.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm leading-tight font-medium">
          <span className="truncate">{member.name}</span>
          {isYou && <span className="label-mono shrink-0">You</span>}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
      <span className="label-mono hidden shrink-0 md:block">Joined {shortDate(member.joinedAt)}</span>
      {canManage && !isYou ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy} aria-label={`Role for ${member.name}: ${label}`} className="shrink-0 font-normal">
              {label}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuRadioGroup value={member.role} onValueChange={changeRole}>
              {roles.map((role) => (
                <DropdownMenuRadioItem key={role.key} value={role.key}>
                  {role.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground sm:w-auto sm:px-3">{label}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="-mr-1 size-8 shrink-0" aria-label={`More actions for ${member.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            onSelect={() => {
              navigator.clipboard?.writeText(member.email).then(
                () => toast.success("Email copied"),
                () => toast.error("Could not copy the email"),
              );
            }}
          >
            <Copy /> Copy email
          </DropdownMenuItem>
          {canManage && !isYou && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 /> Remove from workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function InviteRow({ invite, roles, onRevoke }: { invite: TeamInvite; roles: TeamRole[]; onRevoke: (invite: TeamInvite) => Promise<void> }) {
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

function RequestRow({
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

function MemberSkeleton() {
  return (
    <ul aria-busy className="divide-y overflow-hidden rounded-lg border bg-card">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── invite ──────────────────────────────────────────────────────────────────────────────────────────

function InviteDialog({
  open,
  onOpenChange,
  roles,
  existingEmails,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: TeamRole[];
  existingEmails: string[];
  onInvite: (emails: string[], role: string) => Promise<void>;
}) {
  const defaultRole = (roles.find((r) => r.key === "org:member") ?? roles[roles.length - 1] ?? DEFAULT_ROLES[1]).key;
  const [text, setText] = React.useState("");
  const [role, setRole] = React.useState(defaultRole);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  // Start clean every time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setText("");
      setRole(defaultRole);
      setError(null);
    }
  }, [open, defaultRole]);

  const { valid, invalid } = parseEmails(text);
  const taken = new Set(existingEmails.map((e) => e.toLowerCase()));
  const fresh = valid.filter((e) => !taken.has(e.toLowerCase()));
  const already = valid.length - fresh.length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalid.length > 0) return setError(`${invalid.join(", ")} ${invalid.length === 1 ? "is not an email address" : "are not email addresses"}.`);
    if (fresh.length === 0) return setError(already > 0 ? "Everyone listed is already a member or invited." : "Enter at least one email address.");
    setBusy(true);
    setError(null);
    try {
      await onInvite(fresh, role);
      toast.success(fresh.length === 1 ? `Invitation sent to ${fresh[0]}` : `${fresh.length} invitations sent`);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Could not send the invitations"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite people</DialogTitle>
            <DialogDescription>They get an email with a link to join this workspace.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={inputId}>Email addresses</Label>
            <textarea
              id={inputId}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              rows={3}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="ada@example.com, grace@example.com"
              aria-invalid={!!error}
              aria-describedby={`${inputId}-hint`}
              className="min-h-20 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/30 md:text-sm"
            />
            <p id={`${inputId}-hint`} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
              {error ?? "Separate several addresses with commas, spaces or new lines."}
            </p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">Role</legend>
            <div role="radiogroup" aria-label="Role" className="grid gap-2">
              {roles.map((r) => {
                const selected = role === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(r.key)}
                    className={cn(
                      "flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                      selected ? "border-primary bg-accent" : "border-input hover:bg-accent",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm leading-tight font-medium">{r.name}</span>
                      {r.description && <span className="mt-1 block text-xs text-muted-foreground">{r.description}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <DialogFooter className="items-center sm:justify-between">
            <p className="label-mono">{fresh.length > 0 ? `${fresh.length} ${fresh.length === 1 ? "person" : "people"}` : ""}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || text.trim() === ""}>
                {busy ? "Sending…" : fresh.length > 1 ? "Send invitations" : "Send invitation"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── workspace ───────────────────────────────────────────────────────────────────────────────────────

function WorkspaceSection({ workspace, canManage, actions }: { workspace: TeamWorkspace; canManage: boolean; actions: TeamActions }) {
  const [name, setName] = React.useState(workspace.name);
  const [saving, setSaving] = React.useState(false);
  const [logoBusy, setLogoBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const nameId = React.useId();

  React.useEffect(() => setName(workspace.name), [workspace.name]);

  const trimmed = name.trim();
  const dirty = trimmed !== workspace.name && trimmed !== "";

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      await actions.rename(trimmed);
      toast.success("Workspace renamed");
    } catch (error) {
      toast.error(errorMessage(error, "Could not rename the workspace"));
    } finally {
      setSaving(false);
    }
  };

  const changeLogo = async (file: File | null) => {
    setLogoBusy(true);
    try {
      await actions.setLogo(file);
      toast.success(file ? "Logo updated" : "Logo removed");
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the logo"));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section aria-labelledby="workspace-heading" className="space-y-4">
      <SectionLabel title={<span id="workspace-heading">Workspace</span>} />
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex items-center gap-3">
            <Avatar aria-hidden className="size-12 rounded-md">
              {workspace.hasImage && workspace.imageUrl && <AvatarImage src={workspace.imageUrl} alt="" />}
              <AvatarFallback className="rounded-md bg-muted font-mono text-sm font-semibold text-muted-foreground">{initials(workspace.name)}</AvatarFallback>
            </Avatar>
            {canManage && (
              <div className="flex flex-col items-start gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Workspace logo file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void changeLogo(file);
                  }}
                />
                <Button variant="outline" size="sm" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
                  {logoBusy ? "Uploading…" : workspace.hasImage ? "Change logo" : "Upload logo"}
                </Button>
                {workspace.hasImage && !logoBusy && (
                  <button type="button" onClick={() => changeLogo(null)} className="rounded-xs text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={save} className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={nameId}>Name</Label>
            <div className="flex gap-2">
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} readOnly={!canManage} maxLength={100} className="min-w-0 flex-1" />
              {canManage && (
                <Button type="submit" variant="secondary" disabled={!dirty || saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Leave workspace</p>
            <p className="mt-1 text-xs text-muted-foreground">You lose access to its whiteboards until someone invites you back.</p>
          </div>
          <Button variant="outline" onClick={() => setLeaving(true)} className="text-destructive hover:text-destructive">
            Leave
          </Button>
        </div>

        {canManage && actions.deleteWorkspace && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Delete workspace</p>
              <p className="mt-1 text-xs text-muted-foreground">Removes the workspace and everyone’s access to it. This cannot be undone.</p>
            </div>
            <Button variant="outline" onClick={() => setDeleting(true)} className="text-destructive hover:text-destructive">
              Delete
            </Button>
          </div>
        )}
      </div>

      {actions.openAdvanced && (
        <p className="text-xs text-muted-foreground">
          Verified domains and join requests are managed in{" "}
          <button type="button" onClick={actions.openAdvanced} className="rounded-xs underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            advanced settings
          </button>
          .
        </p>
      )}

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${workspace.name}?`}
        description="You will lose access to its whiteboards until an admin invites you back."
        confirmLabel="Leave workspace"
        onConfirm={actions.leave}
        failureMessage="Could not leave the workspace"
      />
      {actions.deleteWorkspace && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${workspace.name}?`}
          description="Everyone loses access to it. This cannot be undone."
          confirmLabel="Delete workspace"
          requireText={workspace.name}
          onConfirm={actions.deleteWorkspace}
          failureMessage="Could not delete the workspace"
        />
      )}
    </section>
  );
}

// ── shared confirm ──────────────────────────────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requireText,
  onConfirm,
  successMessage,
  failureMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** When set, the action stays disabled until this text is typed. */
  requireText?: string;
  onConfirm: () => Promise<void>;
  successMessage?: string;
  failureMessage: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const id = React.useId();
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      if (successMessage) toast.success(successMessage);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, failureMessage));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireText && (
          <div className="grid gap-2">
            <Label htmlFor={id}>
              Type <span className="font-mono">{requireText}</span> to confirm
            </Label>
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy || (!!requireText && typed !== requireText)}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

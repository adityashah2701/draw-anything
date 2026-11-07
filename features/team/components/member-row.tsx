import * as React from "react";
import { ChevronDown, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  errorMessage,
  roleLabel,
  shortDate,
  type TeamMember,
  type TeamRole,
} from "../team-model";
import { PersonAvatar } from "./person-avatar";

export function MemberRow({
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


import type { TeamInvite, TeamMember, TeamRequest, TeamRole } from "../team-model";

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


"use client";

import * as React from "react";
import { useAuth, useClerk, useOrganization, useUser } from "@clerk/nextjs";

import NoOrganizationState from "@/features/dashboard/components/dashboard/no-organization";
import OrganizationLoading from "@/features/dashboard/components/dashboard/organization-loading";
import { DEFAULT_ROLES, displayName, type TeamInvite, type TeamMember, type TeamRequest, type TeamRole } from "../team-model";
import { TeamView, type TeamActions } from "./team-view";

/** Clerk caps one bulk invitation request at 10 addresses. */
const INVITE_BATCH = 10;

interface TeamPageProps {
  /** Open the invite dialog straight away (arriving from "Invite people" on the dashboard). */
  startInviting?: boolean;
  /** Called after the user leaves or deletes the workspace, so the shell can show the dashboard. */
  onLeft: () => void;
}

/** Connects the Team page to Clerk. Layout and behaviour live in `TeamView`. */
export function TeamPage({ startInviting, onLeft }: TeamPageProps) {
  const { user } = useUser();
  const clerk = useClerk();
  const { has } = useAuth();
  const canManage = !!has?.({ permission: "org:sys_memberships:manage" });

  const { organization, isLoaded, memberships, invitations, membershipRequests } = useOrganization({
    memberships: { infinite: true, keepPreviousData: true },
    // Only admins may list invitations.
    invitations: canManage ? { infinite: true, keepPreviousData: true, status: ["pending"] } : undefined,
    membershipRequests: canManage ? { infinite: true, keepPreviousData: true, status: "pending" } : undefined,
  });

  const [roles, setRoles] = React.useState<TeamRole[]>(DEFAULT_ROLES);
  React.useEffect(() => {
    if (!organization || !canManage) return;
    let cancelled = false;
    organization
      .getRoles({ pageSize: 20 })
      .then((res) => {
        if (!cancelled && res.data.length > 0) setRoles(res.data.map((r) => ({ key: r.key, name: r.name, description: r.description || undefined })));
      })
      .catch(() => {
        // Keep the built-in roles; inviting and role changes still work with them.
      });
    return () => {
      cancelled = true;
    };
  }, [organization, canManage]);

  const members = React.useMemo<TeamMember[]>(
    () =>
      (memberships?.data ?? []).flatMap((m) => {
        const person = m.publicUserData;
        if (!person?.userId) return [];
        return [
          {
            id: m.id,
            userId: person.userId,
            name: displayName(person.firstName, person.lastName, person.identifier),
            email: person.identifier,
            imageUrl: person.hasImage ? person.imageUrl : undefined,
            role: m.role,
            roleName: m.roleName,
            joinedAt: m.createdAt,
          },
        ];
      }),
    [memberships?.data],
  );

  const invites = React.useMemo<TeamInvite[]>(
    () => (invitations?.data ?? []).map((i) => ({ id: i.id, email: i.emailAddress, role: i.role, roleName: i.roleName, createdAt: i.createdAt })),
    [invitations?.data],
  );

  const requests = React.useMemo<TeamRequest[]>(
    () =>
      (membershipRequests?.data ?? []).map((r) => ({
        id: r.id,
        name: displayName(r.publicUserData.firstName, r.publicUserData.lastName, r.publicUserData.identifier),
        email: r.publicUserData.identifier,
        imageUrl: r.publicUserData.hasImage ? r.publicUserData.imageUrl : undefined,
        createdAt: r.createdAt,
      })),
    [membershipRequests?.data],
  );

  const actions = React.useMemo<TeamActions | null>(() => {
    if (!organization) return null;
    // Counts in the sidebar and header come from the organization resource.
    const refresh = () => Promise.all([memberships?.revalidate?.(), invitations?.revalidate?.(), membershipRequests?.revalidate?.(), organization.reload()]).then(() => undefined);
    const leaveShell = async () => {
      try {
        await clerk.setActive({ organization: null });
      } catch {
        // The membership is already gone; the shell shows the no-workspace state either way.
      }
      onLeft();
    };

    return {
      invite: async (emails, role) => {
        for (let i = 0; i < emails.length; i += INVITE_BATCH) {
          await organization.inviteMembers({ emailAddresses: emails.slice(i, i + INVITE_BATCH), role });
        }
        await refresh();
      },
      changeRole: async (member, role) => {
        await organization.updateMember({ userId: member.userId, role });
        await refresh();
      },
      removeMember: async (member) => {
        await organization.removeMember(member.userId);
        await refresh();
      },
      revokeInvite: async (invite) => {
        const resource = invitations?.data?.find((i) => i.id === invite.id);
        if (!resource) throw new Error("This invitation is no longer pending.");
        await resource.revoke();
        await refresh();
      },
      approveRequest: async (request) => {
        const resource = membershipRequests?.data?.find((r) => r.id === request.id);
        if (!resource) throw new Error("This request is no longer pending.");
        await resource.accept();
        await refresh();
      },
      rejectRequest: async (request) => {
        const resource = membershipRequests?.data?.find((r) => r.id === request.id);
        if (!resource) throw new Error("This request is no longer pending.");
        await resource.reject();
        await refresh();
      },
      rename: async (name) => {
        await organization.update({ name });
      },
      setLogo: async (file) => {
        await organization.setLogo({ file });
        await organization.reload();
      },
      leave: async () => {
        await user?.leaveOrganization(organization.id);
        await leaveShell();
      },
      deleteWorkspace: organization.adminDeleteEnabled
        ? async () => {
            await organization.destroy();
            await leaveShell();
          }
        : undefined,
      openAdvanced: () => clerk.openOrganizationProfile(),
      loadMore: memberships?.hasNextPage ? () => memberships.fetchNext?.() : undefined,
    };
  }, [organization, memberships, invitations, membershipRequests, user, clerk, onLeft]);

  if (!isLoaded) return <OrganizationLoading />;
  if (!organization || !actions) return <NoOrganizationState />;

  return (
    <TeamView
      workspace={{ name: organization.name, imageUrl: organization.imageUrl, hasImage: organization.hasImage }}
      members={members}
      invites={invites}
      requests={requests}
      roles={roles}
      currentUserId={user?.id}
      canManage={canManage}
      loading={!!memberships?.isLoading && members.length === 0}
      hasMoreMembers={!!memberships?.hasNextPage}
      startInviting={startInviting}
      actions={actions}
    />
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSidebar } from "@/components/ui/sidebar";
import { SidebarView } from "./sidebar-view";

/** Connects the sidebar to Clerk (user, workspaces) and Convex (recent boards). Layout lives in `SidebarView`. */
export function AppSidebar({
  selectedPage,
  setSelectedPage,
  ...props
}: {
  selectedPage: string;
  setSelectedPage: (page: string) => void;
} & Omit<React.ComponentProps<typeof SidebarView>, "workspace" | "workspaces" | "user" | "recent" | "actions" | "onNavigate" | "selectedPage" | "membersCount">) {
  const router = useRouter();
  const clerk = useClerk();
  const { user } = useUser();
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
  const { isMobile, setOpenMobile } = useSidebar();

  const { data: whiteboards } = useApiQuery(api.whiteboard.getAll, organization?.id ? { orgId: organization.id } : "skip");
  const recent = React.useMemo(
    () =>
      [...((whiteboards ?? []) as Doc<"whiteboards">[])]
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((board) => ({ id: board._id, title: board.title })),
    [whiteboards],
  );

  // On a phone the navigation is a sheet: choosing something should reveal it.
  const dismissOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const workspaces = (userMemberships.data ?? []).map(({ organization: org }) => ({ id: org.id, name: org.name, imageUrl: org.imageUrl }));

  return (
    <SidebarView
      {...props}
      selectedPage={selectedPage}
      onNavigate={(page) => {
        setSelectedPage(page);
        dismissOnMobile();
      }}
      workspace={organization ? { id: organization.id, name: organization.name, imageUrl: organization.imageUrl } : null}
      membersCount={organization?.membersCount}
      workspaces={workspaces}
      user={{
        name: user?.fullName ?? user?.username ?? "Account",
        email: user?.primaryEmailAddress?.emailAddress,
        imageUrl: user?.imageUrl,
      }}
      recent={recent}
      actions={{
        switchWorkspace: async (id) => {
          try {
            await setActive?.({ organization: id });
            setSelectedPage("Dashboard");
            router.push("/");
            dismissOnMobile();
          } catch {
            toast.error("Could not switch workspace");
          }
        },
        createWorkspace: () => router.push("/create-org"),
        manageWorkspace: () => clerk.openOrganizationProfile(),
        manageAccount: () => clerk.openUserProfile(),
        signOut: () => clerk.signOut(),
        openBoard: (id) => router.push(`/whiteboard/${id}`),
      }}
    />
  );
}

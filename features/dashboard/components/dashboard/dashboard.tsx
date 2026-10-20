import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiQuery } from "@/hooks/use-api-query";
import OrganizationLoading from "./organization-loading";
import NoOrganizationState from "./no-organization";
import ShowOrgProfile from "./show-org-profile";
import { DashboardHome, DashboardSkeleton } from "./dashboard-home";

interface DashboardProps {
  user?: unknown;
  selectedPage: string;
  setSelectedPage: (page: string) => void;
}

const Dashboard = ({ setSelectedPage }: DashboardProps) => {
  // All hooks first: the conditional returns below must not change the hook order.
  const { organization, isLoaded } = useOrganization();
  const router = useRouter();
  const [showOrgProfile, setShowOrgProfile] = useState(false);
  const { mutate, isPending } = useApiMutation(api.whiteboard.create);
  const { data: whiteboards = [], isPending: queryPending } = useApiQuery(
    api.whiteboard.getAll,
    organization?.id ? { orgId: organization.id } : "skip",
  );

  if (!isLoaded) return <OrganizationLoading />;
  if (!organization) return <NoOrganizationState />;
  if (showOrgProfile) {
    return <ShowOrgProfile organization={organization} handleBackToDashboard={() => setShowOrgProfile(false)} />;
  }
  if (queryPending) return <DashboardSkeleton />;

  // Copy before sorting: the query result is shared state.
  const boards = [...(whiteboards as Doc<"whiteboards">[])].sort((a, b) => b._creationTime - a._creationTime);

  const handleCreateWhiteboard = async () => {
    try {
      const id = await mutate({ title: "Untitled", orgId: organization.id });
      router.push(`/whiteboard/${id}`);
    } catch {
      toast.error("Could not create the whiteboard");
    }
  };

  return (
    <DashboardHome
      organizationName={organization.name}
      membersCount={organization.membersCount}
      boards={boards}
      isCreating={isPending}
      onCreate={handleCreateWhiteboard}
      onInvite={() => setShowOrgProfile(true)}
      onShowAll={() => setSelectedPage("Whiteboards")}
    />
  );
};

export default Dashboard;


import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiQuery } from "@/hooks/use-api-query";
import OrganizationLoading from "./organization-loading";
import NoOrganizationState from "./no-organization";
import { DashboardHome, DashboardSkeleton } from "./dashboard-home";
import { PendingWorkspaces } from "@/features/invitations/components/pending-workspaces";

interface DashboardProps {
  user?: unknown;
  selectedPage: string;
  setSelectedPage: (page: string) => void;
  /** Take the user to Members with the invite dialog open. */
  onInvite: () => void;
}

const Dashboard = ({ setSelectedPage, onInvite }: DashboardProps) => {
  // All hooks first: the conditional returns below must not change the hook order.
  const { organization, isLoaded } = useOrganization();
  const router = useRouter();
  const { mutate, isPending } = useApiMutation(api.whiteboard.create);
  const { data: whiteboards = [], isPending: queryPending } = useApiQuery(
    api.whiteboard.getAll,
    organization?.id ? { orgId: organization.id } : "skip",
  );

  if (!isLoaded) return <OrganizationLoading />;
  if (!organization) return <NoOrganizationState />;
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
    <>
      <PendingWorkspaces className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-8 sm:pt-10" />
      <DashboardHome
        organizationName={organization.name}
        membersCount={organization.membersCount}
        boards={boards}
        isCreating={isPending}
        onCreate={handleCreateWhiteboard}
        onInvite={onInvite}
        onShowAll={() => setSelectedPage("Whiteboards")}
      />
    </>
  );
};

export default Dashboard;

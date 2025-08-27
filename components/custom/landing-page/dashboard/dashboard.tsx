import { useState } from "react";
import WelcomeHeader from "./_components/welcome-header";
import QuickActions from "./_components/quick-actions";
import RecentProjects from "./_components/recent-projects/recent-projects";
import RecentProjectsSkeleton from "./_components/recent-projects/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Users } from "lucide-react";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/convex/_generated/api";
import { useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/hooks/use-api-query";
import NoOrganizationState from "./_components/no-organization";
import ShowOrgProfile from "./_components/show-org-profile";
import OrganizationLoading from "./_components/organization-loading";

interface DashboardProps {
  user: any;
  selectedPage: string;
  setSelectedPage: any;
}

// Statistics Cards Skeleton
const StatisticsCardsSkeleton = () => {
  return (
    <div className="mb-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 animate-pulse">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="bg-white rounded-xl p-4 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-16"></div>
            </div>
            <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const Dashboard = ({ user, setSelectedPage }: DashboardProps) => {
  // ✅ ALL HOOKS AT THE TOP - BEFORE ANY CONDITIONAL LOGIC
  const { organization, isLoaded } = useOrganization();
  const router = useRouter();
  const [showOrgProfile, setShowOrgProfile] = useState(false);
  const { mutate, isPending } = useApiMutation(api.whiteboard.create);
  
  // ✅ Move useApiQuery here and use "skip" when organization doesn't exist
  const { data: whiteboards = [], isPending: queryPending } = useApiQuery(
    api.whiteboard.getAll,
    organization?.id ? { orgId: organization.id } : "skip"
  );

  // ✅ NOW we can do conditional logic after all hooks are declared
  if (!isLoaded) {
    return <OrganizationLoading />;
  }

  if (!organization) {
    return <NoOrganizationState />;
  }

  // Organization Profile View
  if (showOrgProfile) {
    return <ShowOrgProfile organization={organization} />;
  }

  const recentBoards = whiteboards
    .sort((a: any, b: any) => b._creationTime - a._creationTime)
    .slice(0, 8)
    .map((board: any) => ({
      _id: board._id,
      title: board.title,
      imageUrl: board.imageUrl,
      content: board.content,
      tags: board.tags,
      _creationTime: board._creationTime,
      lastModifiedBy: board.lastModifiedBy,
    }));

  const handleCreateWhiteboard = async () => {
    try {
      if (!organization) {
        toast.error("Please select an organization first.");
        return null;
      }
      const whiteboard = await mutate({
        title: "Untitled",
        orgId: organization.id,
      });
      toast.success("Whiteboard created successfully.");
      router.push(`/whiteboard/${whiteboard}`);
    } catch (error) {
      toast.error("Failed to create whiteboard");
    }
  };

  const handleUploadFile = () => {
    if (!organization) {
      toast.error("Please select an organization first.");
      return;
    }
    console.log("Opening file upload...");
    toast.info("File upload feature coming soon!");
  };

  const handleInviteTeam = () => {
    try {
      if (!organization) {
        toast.error("Please select an organization first.");
        return;
      }
      setShowOrgProfile(true);
      toast.success("Opening team management");
    } catch (error) {
      toast.error("Failed to open team management");
    }
  };

  const handleBackToDashboard = () => {
    setShowOrgProfile(false);
  };

  // Regular Dashboard View
  return (
    <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Header */}
        <WelcomeHeader
          user={user}
          handleCreateWhiteboard={handleCreateWhiteboard}
        />

        {/* Statistics Cards - Show skeleton while loading */}
        {queryPending ? (
          <StatisticsCardsSkeleton />
        ) : whiteboards.length > 0 ? (
          <div className="mb-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Whiteboards</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {whiteboards.length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Organization</p>
                  <p className="text-lg font-bold text-gray-900 truncate">
                    {organization.name}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">This Week</p>
                  <p className="text-2xl font-bold text-green-600">
                    {
                      whiteboards.filter((board: any) => {
                        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                        return board._creationTime > oneWeekAgo;
                      }).length
                    }
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Team Members</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {organization.membersCount || 1}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Empty State for No Whiteboards */}
        {!queryPending && whiteboards.length === 0 && (
          <div className="bg-white rounded-xl p-8 border border-gray-200 text-center mb-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No whiteboards yet
            </h3>
            <p className="text-gray-600 mb-6">
              Get started by creating your first whiteboard for{" "}
              {organization.name}
            </p>
            <Button onClick={handleCreateWhiteboard} disabled={isPending}>
              <Plus className="w-4 h-4 mr-2" />
              {isPending ? "Creating..." : "Create Your First Whiteboard"}
            </Button>
          </div>
        )}

        {!queryPending && (
          <QuickActions
            onCreateWhiteboard={handleCreateWhiteboard}
            onUploadFile={handleUploadFile}
            onInviteTeam={handleInviteTeam}
          />
        )}

        {/* Main Content Grid - Show skeleton while loading */}
        <div className="grid w-full grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="xl:col-span-2">
            {queryPending ? (
              <RecentProjectsSkeleton />
            ) : whiteboards.length > 0 ? (
              <RecentProjects projects={recentBoards} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
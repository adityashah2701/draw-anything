import React, { useState, useEffect } from "react";
import WelcomeHeader from "./_components/welcome-header";
import QuickActions from "./_components/quick-actions";
import RecentProjects from "./_components/recent-projects/recent-projects";
import { Button } from "@/components/ui/button";
import CreateWhiteboardDialog from "../../create-whiteboard";
import { Plus, X, ArrowLeft } from "lucide-react";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/convex/_generated/api";
import { OrganizationProfile, useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/hooks/use-api-query";

interface DashboardProps {
  user: any;
  selectedPage: string;
  setSelectedPage: any;
}

const Dashboard = ({ user, setSelectedPage }: DashboardProps) => {
  const { organization } = useOrganization();
  const router = useRouter();
  const [showOrgProfile, setShowOrgProfile] = useState(false);

  const { mutate, isPending } = useApiMutation(api.whiteboard.create);
  const { data: whiteboards = [], isPending: queryPending } = useApiQuery(
    api.whiteboard.getAll,
    organization?.id ? { orgId: organization.id } : "skip"
  );

  const recentBoards = whiteboards
    .sort((a: any, b: any) => b._creationTime - a._creationTime)
    .slice(0, 8) // Show more recent boards
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
        toast.error("Please select an organization.");
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
    console.log("Opening file upload...");
    toast.info("File upload feature coming soon!");
  };

  const handleInviteTeam = () => {
    try {
      if (!organization) {
        toast.error("Please select an organization.");
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

  // If showing organization profile, render it directly
  if (showOrgProfile) {
    return (
      <div className="flex-1 ml-20 lg:ml-0 bg-gray-50 min-h-screen flex flex-col">
        {/* Header with back button */}
        <div className="flex-shrink-0 p-4 sm:p-6 bg-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              onClick={handleBackToDashboard}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 self-start"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                Team Management
              </h1>
            </div>
          </div>
        </div>

        {/* Organization Profile Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {organization && (
            <div className="flex-1 w-full max-w-none overflow-auto">
              <div className="min-h-full">
                <OrganizationProfile
                  appearance={{
                    elements: {
                      rootBox: {
                        width: "100%",
                        height: "100%",
                        minHeight: "100vh",
                      },
                      cardBox: {
                        width: "100%",
                        maxWidth: "none",
                        height: "auto",
                        minHeight: "100%",
                        boxShadow: "none",
                        border: "none",
                        borderRadius: "0",
                        padding: "1rem",
                        "@media (min-width: 640px)": {
                          padding: "1.5rem",
                        },
                        "@media (min-width: 1024px)": {
                          padding: "2rem",
                        },
                      },
                      headerTitle: {
                        fontSize: "1.25rem",
                        "@media (min-width: 640px)": {
                          fontSize: "1.5rem",
                        },
                      },
                      headerSubtitle: {
                        fontSize: "0.875rem",
                        "@media (min-width: 640px)": {
                          fontSize: "1rem",
                        },
                      },
                      navbar: {
                        flexDirection: "column",
                      },
                      navbarButton: {
                        width: "100%",
                        justifyContent: "flex-start",
                        "@media (min-width: 768px)": {
                          width: "auto",
                          justifyContent: "center",
                        },
                      },
                      formFieldInput: {
                        width: "100%",
                      },
                      formButtonPrimary: {
                        width: "100%",
                        "@media (min-width: 640px)": {
                          width: "auto",
                        },
                      },
                      table: {
                        fontSize: "0.875rem",
                        overflowX: "auto",
                      },
                      tableHead: {
                        fontSize: "0.75rem",
                        "@media (min-width: 640px)": {
                          fontSize: "0.875rem",
                        },
                      },
                      tableCell: {
                        padding: "0.5rem",
                        "@media (min-width: 640px)": {
                          padding: "0.75rem",
                        },
                      },
                      memberPreview: {
                        flexDirection: "column",
                        "@media (min-width: 640px)": {
                          flexDirection: "row",
                        },
                      },
                      organizationPreview: {
                        flexDirection: "column",
                        alignItems: "flex-start",
                        "@media (min-width: 640px)": {
                          flexDirection: "row",
                          alignItems: "center",
                        },
                      },
                    },
                    layout: {
                      shimmer: false,
                    },
                    variables: {
                      borderRadius: "0.5rem",
                      spacingUnit: "1rem",
                    },
                  }}
                  routing="hash"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular dashboard view
  return (
    <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Header */}
        <WelcomeHeader
          user={user}
          handleCreateWhiteboard={handleCreateWhiteboard}
        />

        {/* Statistics Cards */}
        {!queryPending && whiteboards.length > 0 && (
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
                    {organization?.name || "No Organization"}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-6m-2-5h4m-4 0V9a1 1 0 011-1h2a1 1 0 011 1v7m-4 0h4"
                    />
                  </svg>
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
                    {organization?.membersCount || 1}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-orange-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <QuickActions
          onCreateWhiteboard={handleCreateWhiteboard}
          onUploadFile={handleUploadFile}
          onInviteTeam={handleInviteTeam}
        />

        {/* Main Content Grid */}
        <div className="grid w-full grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Recent Projects - Takes 2 columns */}
          <div className="xl:col-span-2">
            <RecentProjects projects={recentBoards} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

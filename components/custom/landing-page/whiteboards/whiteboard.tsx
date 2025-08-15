"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import WhiteboardEmptyState from "./whiteboard-empty-state";
import { api } from "@/convex/_generated/api";
import { CreateOrganization, useOrganization, useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import WhiteboardCard from "./_components/whiteboard-card";
import { Loader, Plus, Building, Users, ArrowRight } from "lucide-react";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiQuery } from "@/hooks/use-api-query";
import { ClerkDialog } from "../../custom-dialog";

const Whiteboard = (props: any) => {
  const router = useRouter();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user, isLoaded: userLoaded } = useUser();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Only fetch whiteboards if we have an organization
  const { data: whiteboards = [], isPending: queryPending } = useApiQuery(
    api.whiteboard.getAll,
    organization?.id ? { orgId: organization.id } : "skip"
  );

  const { mutate, isPending: mutationPending } = useApiMutation(
    api.whiteboard.create
  );

  const handleCreate = async () => {
    if (!organization) {
      toast.error("Please select an organization first.");
      return;
    }
    try {
      const whiteboard = await mutate({
        title: "Untitled",
        orgId: organization.id,
      });
      toast.success("Whiteboard created successfully.");
      //  router.push(`/whiteboard/${whiteboard}`);
    } catch (error) {
      toast.error("Failed to create whiteboard.");
    }
  };

  const handleCreateOrganization = () => {
    // Redirect to Clerk's organization creation page
    window.location.href = "/organization";
  };

  // Loading state while checking user and organization status
  if (!orgLoaded || !userLoaded) {
    return (
      <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 animate-spin text-gray-500" />
            <span className="ml-3 text-gray-600">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // User is not authenticated
  if (!user) {
    return (
      <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Sign in Required
              </h2>
              <p className="text-gray-600 mb-6">
                Please sign in to access your whiteboards and start
                collaborating.
              </p>
              <Button onClick={() => router.push("/sign-in")} size="lg">
                Sign In
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No organization selected
  if (!organization) {
    return (
      <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Building className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                No Organization Selected
              </h2>
              <p className="text-gray-600 mb-8">
                You need to select or create an organization to manage
                whiteboards. Organizations help you collaborate with your team
                and organize your work.
              </p>
              <div className="space-y-4 flex gap-4 justify-center">
                <ClerkDialog
                  isOpen={isDialogOpen}
                  onOpenChange={setIsDialogOpen}
                  trigger={
                    <Button>
                      <Plus className="w-full h-4 mr-2" />
                      Create Organization
                    </Button>
                  }
                >
                  <CreateOrganization
                    appearance={{
                      elements: {
                        cardBox: {
                          height: "100%",
                          width: "100%",
                          overflow: "hidden",
                        },
                        rootBox: {
                          height: "100%",
                          width: "100%",
                        },
                      },
                    }}
                  />
                </ClerkDialog>
                <Button onClick={() => {}} variant="outline" size="lg">
                  <Building className="w-4 h-4 mr-2" />
                  Manage Organizations
                </Button>
              </div>
              <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> You can switch between organizations
                  using the organization selector in the top navigation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading whiteboards
  if (queryPending) {
    return (
      <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Whiteboards
              </h1>
              <p className="text-gray-600">
                Create and collaborate on visual ideas
              </p>
            </div>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              New Whiteboard
            </Button>
          </div>

          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 animate-spin text-gray-500" />
            <span className="ml-3 text-gray-600">Loading whiteboards...</span>
          </div>
        </div>
      </div>
    );
  }

  // Main content - organization exists and user is authenticated
  return (
    <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Whiteboards
            </h1>
            <p className="text-gray-600">
              Create and collaborate on visual ideas
            </p>
            {organization && (
              <div className="mt-6 border-b border-gray-200 pb-3">
                <h2 className="flex items-center text-2xl font-semibold text-gray-800">
                  <Building className="w-5 h-5 mr-2 text-gray-600" />
                  {organization.name}
                </h2>
              </div>
            )}
          </div>

          <Button onClick={handleCreate} disabled={mutationPending}>
            {mutationPending ? (
              <Loader className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            New Whiteboard
          </Button>
        </div>

        {/* Whiteboards or Empty State */}
        {whiteboards.length === 0 ? (
          <WhiteboardEmptyState
            type="no-whiteboards"
            onCreateNew={handleCreate}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {whiteboards.map((board: any) => (
              <WhiteboardCard key={board._id} board={board} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;

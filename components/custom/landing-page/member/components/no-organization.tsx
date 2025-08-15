"use client";
import { ClerkDialog } from "@/components/custom/custom-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateOrganization } from "@clerk/nextjs";
import { Building2, Plus, X } from "lucide-react";
import React, { useState } from "react";

const NoOrganization = ({ user }: any) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="flex-1 ml-20 lg:ml-0 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Team Members
          </h1>
          <p className="text-gray-600">
            You're currently working as an individual user
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            No Organization Yet
          </h3>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            Create or join an organization to collaborate with team members and
            manage shared resources.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <ClerkDialog
              isOpen={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              trigger={
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
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
           
          </div>
        </div>

        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Your Account
          </h3>
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName} />
              <AvatarFallback className="bg-blue-100 text-blue-700 font-medium">
                {user?.fullName
                  ?.split(" ")
                  .map((n: string) => n[0])
                  .join("") || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-gray-900">
                {user?.fullName || "Unknown User"}
              </p>
              <p className="text-sm text-gray-500">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 mt-1">
                Personal Account
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoOrganization;

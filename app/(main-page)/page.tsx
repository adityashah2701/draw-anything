"use client";
import { useOrganization, useUser } from "@clerk/nextjs";
import React, { useState } from "react";
import Dashboard from "@/features/dashboard/components/dashboard/dashboard";
import Whiteboards from "@/features/dashboard/components/whiteboards/whiteboard";
import Members from "@/features/dashboard/components/member/member";
import CustomLoader from "@/components/shared/loader";
import Page from "@/features/dashboard/components/unauthenticated-page";
import CleanNavbar from "@/components/layout/navbar/navbar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { BillingPage } from "@/features/billing/components/billing-page";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// Type for navigation items
type NavigationItem =
  | "Dashboard"
  | "Whiteboards"
  | "Templates"
  | "Shared with Me"
  | "Members"
  | "Roles & Permissions"
  | "Billing";

const LandingPage = () => {
  const { isLoaded, isSignedIn, user } = useUser();
  const [selectedPage, setSelectedPage] = useState<NavigationItem>("Dashboard");
  const { organization, membership } = useOrganization();
  if (!isLoaded) {
    return <CustomLoader />;
  }

  // Show unauthenticated page
  if (!isSignedIn) {
    return <Page />;
  }

  // Render the appropriate authenticated page component
  const renderSelectedPage = () => {
    const commonProps = {
      selectedPage,
      setSelectedPage,
      user,
      organization,
      membership,
    };

    switch (selectedPage) {
      case "Dashboard":
        return <Dashboard {...commonProps} />;
      case "Whiteboards":
        return <Whiteboards {...commonProps} />;
      case "Members":
        return <Members {...commonProps} />;
      case "Billing":
        return <BillingPage />;
      default:
        return <Dashboard {...commonProps} />;
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar
        selectedPage={selectedPage}
        setSelectedPage={(page: string) =>
          setSelectedPage(page as NavigationItem)
        }
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4 sticky top-0 z-50">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1">
            <CleanNavbar isSidebarIntegrated={true} />
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-gray-50">
          {renderSelectedPage()}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default LandingPage;

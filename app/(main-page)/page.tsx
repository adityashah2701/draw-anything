"use client";
import { useUser } from "@clerk/nextjs";
import React, { useState } from "react";
import Dashboard from "@/features/dashboard/components/dashboard/dashboard";
import Whiteboards from "@/features/dashboard/components/whiteboards/whiteboard";
import { TeamPage } from "@/features/team/components/team-page";
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
  // "Invite people" on the dashboard lands on Members with the invite dialog open.
  const [inviteOnArrival, setInviteOnArrival] = useState(false);
  if (!isLoaded) {
    return <CustomLoader />;
  }

  // Show unauthenticated page
  if (!isSignedIn) {
    return <Page />;
  }

  const goTo = (page: string) => {
    setInviteOnArrival(false);
    setSelectedPage(page as NavigationItem);
  };
  const goToInvite = () => {
    setInviteOnArrival(true);
    setSelectedPage("Members");
  };

  // Render the appropriate authenticated page component
  const renderSelectedPage = () => {
    switch (selectedPage) {
      case "Whiteboards":
        return <Whiteboards />;
      case "Members":
        return <TeamPage startInviting={inviteOnArrival} onLeft={() => goTo("Dashboard")} />;
      case "Billing":
        return <BillingPage />;
      default:
        return <Dashboard user={user} selectedPage={selectedPage} setSelectedPage={goTo} onInvite={goToInvite} />;
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar selectedPage={selectedPage} setSelectedPage={goTo} />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
          <SidebarTrigger className="-ml-1" />
          <span className="label-mono sr-only md:not-sr-only">{selectedPage}</span>
          <div className="flex-1">
            <CleanNavbar isSidebarIntegrated={true} />
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background">{renderSelectedPage()}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default LandingPage;

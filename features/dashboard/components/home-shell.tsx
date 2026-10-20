"use client";
import { useUser } from "@clerk/nextjs";
import React, { useState, type ReactNode } from "react";
import Dashboard from "@/features/dashboard/components/dashboard/dashboard";
import Whiteboards from "@/features/dashboard/components/whiteboards/whiteboard";
import { TeamPage } from "@/features/team/components/team-page";
import CustomLoader from "@/components/shared/loader";
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

/**
 * `landing` is the server-rendered public page. It stays in the HTML for crawlers and signed-out
 * visitors; a returning signed-in visitor (see AUTH_HINT_SCRIPT) sees the loader instead of a flash of it.
 */
const HomeShell = ({ landing }: { landing: ReactNode }) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const [selectedPage, setSelectedPage] = useState<NavigationItem>("Dashboard");
  // "Invite people" on the dashboard lands on Members with the invite dialog open.
  const [inviteOnArrival, setInviteOnArrival] = useState(false);
  // One structure for "loading" and "signed out", so the landing page is not remounted (and its demo
  // restarted) when Clerk finishes loading.
  if (!isLoaded || !isSignedIn) {
    return (
      <>
        <div data-landing>{landing}</div>
        {!isLoaded && (
          <div className="hidden [html[data-auth=in]_&]:block">
            <CustomLoader />
          </div>
        )}
      </>
    );
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

export default HomeShell;

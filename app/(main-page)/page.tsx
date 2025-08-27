"use client";
import { useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";
import React, { useState } from "react";
import Dashboard from "@/components/custom/landing-page/dashboard/dashboard";
import Whiteboards from "@/components/custom/landing-page/whiteboards/whiteboard";
import Members from "@/components/custom/landing-page/member/member";
import CustomLoader from "@/components/custom/loader";
import Page from "@/components/custom/landing-page/unauthenticated-page";
import CleanNavbar from "@/app/(main-page)/_components/_navbar/navbar";
import MainSideBar from "@/app/(main-page)/_components/_main-sidebar/main-sidebar";

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
      default:
        return <Dashboard {...commonProps} />;
    }
  };

  return (
    <main className="w-full min-h-screen relative overflow-hidden bg-gray-50">
      {/* Navbar */}
      <div className="h-20 w-full flex sticky top-0 z-50 items-center bg-white border-b border-gray-200">
        <CleanNavbar />
      </div>
      <div className="h-[calc(100vh-5rem)] w-full flex relative">
        <MainSideBar
          selectedPage={selectedPage}
          setSelectedPage={setSelectedPage}
          user={user}
        />
        {renderSelectedPage()}
      </div>
    </main>
  );
};

export default LandingPage;

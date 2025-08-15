"use client";

import type React from "react";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  LayoutTemplateIcon as Template,
  Share2,
  Users,
  Shield,
  CreditCard,
} from "lucide-react";

import MobileSidebar from "./_components/mobile-sidebar";
import DesktopSidebar from "./_components/desktop-sidebar";

const MainSideBar = ({ user, selectedPage, setSelectedPage }: any) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const primaryNavItems = [
    { icon: <LayoutDashboard className="w-full h-full" />, label: "Dashboard" },
    { icon: <FileText className="w-full h-full" />, label: "Whiteboards" },
  ];

  const organizationItems = [
    { icon: <Users className="w-full h-full" />, label: "Members" },
  ];

  return (
    <>
      {/* Mobile Sidebar - Always collapsed */}
      <div className="lg:hidden fixed top-16 sm:top-20 left-0 bottom-0 w-16 sm:w-20 bg-white border-r border-gray-200 z-30 flex flex-col">
        {/* Mobile Header */}
        <div className="flex items-center justify-center p-2 sm:p-3 border-b border-gray-100"></div>

        {/* Mobile Navigation Content */}
        <MobileSidebar
          primaryNavItems={primaryNavItems}
          organizationItems={organizationItems}
          user={user}
          selectedPage={selectedPage}
          setSelectedPage={setSelectedPage}
        />
      </div>

      {/* Desktop Sidebar */}
      <DesktopSidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        primaryNavItems={primaryNavItems}
        selectedPage={selectedPage}
        setSelectedPage={setSelectedPage}
        organizationItems={organizationItems}
        user={user}
      />
    </>
  );
};

export default MainSideBar;

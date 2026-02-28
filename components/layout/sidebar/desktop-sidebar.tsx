import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, LogOutIcon, Menu, Plus, X } from "lucide-react";
import React from "react";
import NavItem from "./nav-item";
import CollapsibleSection from "./collapsible-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignOutButton, UserButton, UserProfile } from "@clerk/nextjs";

const DesktopSidebar = ({
  isCollapsed,
  setIsCollapsed,
  primaryNavItems,
  selectedPage,
  setSelectedPage,
  organizationItems,
  user,
}: any) => {
  return (
    <div
      className={cn(
        "hidden lg:flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200 relative",
        isCollapsed ? "w-20" : "w-64 xl:w-72"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center border-gray-100 transition-all",
          isCollapsed ? "justify-center p-3" : "justify-end relative p-1 xl:p-1"
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "hover:bg-gray-100 transition-colors",
            isCollapsed
              ? "h-9 w-9 xl:h-10 xl:w-10 p-0"
              : "h-7 w-7 xl:h-8 xl:w-8 p-0"
          )}
        >
          {isCollapsed ? (
            <Menu className="h-3 w-3 xl:h-4 xl:w-4" />
          ) : (
            <X className="h-3 w-3 xl:h-4 xl:w-4" />
          )}
        </Button>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className={cn(
            "flex-1 overflow-y-auto space-y-4 xl:space-y-6",
            isCollapsed ? "p-2" : "p-3 xl:p-4"
          )}
        >
          {/* Primary Navigation */}
          <div className="space-y-1">
            {primaryNavItems.map((item: any) => (
              <NavItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                isActive={selectedPage === item.label}
                onClick={() => setSelectedPage(item.label)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>

          {/* Quick Action */}

          {isCollapsed && (
            <div className="border-t border-gray-100 pt-2">
              <Button className="w-full h-10 xl:h-12 p-0 rounded-lg" size="sm">
                <Plus className="h-4 w-4 xl:h-5 xl:w-5" />
              </Button>
            </div>
          )}

          {/* Organization Management */}
          {!isCollapsed && (
            <CollapsibleSection title="Organization">
              <div className="space-y-1">
                {organizationItems.map((item: any) => (
                  <NavItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    isActive={selectedPage === item.label}
                    onClick={() => setSelectedPage(item.label)}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>

        {/* User Profile */}
        <div
          className={cn(
            "border-t border-gray-100",
            isCollapsed ? "p-2" : "p-3 xl:p-4"
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center rounded-lg hover:bg-gray-50 transition-colors",
                  isCollapsed
                    ? "justify-center p-2 xl:p-3"
                    : "gap-2 xl:gap-3 p-2"
                )}
              >
                <Avatar className="h-7 w-7 xl:h-8 xl:w-8 flex-shrink-0">
                  <AvatarImage
                    src={user?.imageUrl || "/placeholder.svg"}
                    alt={user?.fullName}
                  />
                  <AvatarFallback className="bg-blue-100 text-blue-700 font-medium text-xs xl:text-sm">
                    {user?.fullName
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs xl:text-sm font-medium text-gray-800 truncate">
                        {user?.fullName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user?.organization || "Personal"}
                      </p>
                    </div>
                    <ChevronDown className="h-3 w-3 xl:h-4 xl:w-4 text-gray-400 flex-shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 xl:w-56">
              <DropdownMenuItem asChild className="text-red-600 text-sm ">
                <SignOutButton>
                  <div className="flex">
                    <LogOutIcon />
                    Logout
                  </div>
                </SignOutButton>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

export default DesktopSidebar;

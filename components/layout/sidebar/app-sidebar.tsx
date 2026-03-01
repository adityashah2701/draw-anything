"use client";

import * as React from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  CreditCard,
  GalleryVerticalEnd,
  ChevronsUpDown,
} from "lucide-react";
import {
  UserButton,
  OrganizationSwitcher,
  useUser,
  useOrganization,
} from "@clerk/nextjs";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AppSidebar({
  selectedPage,
  setSelectedPage,
  ...props
}: {
  selectedPage: string;
  setSelectedPage: (page: string) => void;
} & React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser();
  const { organization } = useOrganization();

  const primaryNavItems = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: FileText, label: "Whiteboards" },
  ];

  const organizationItems = [
    { icon: Users, label: "Members" },
    { icon: CreditCard, label: "Billing" },
  ];

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex items-center cursor-pointer">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none pl-2">
                  <span className="font-semibold text-base">Draw Anything</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNavItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={selectedPage === item.label}
                    onClick={() => setSelectedPage(item.label)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Organization</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {organizationItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={selectedPage === item.label}
                    onClick={() => setSelectedPage(item.label)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="gap-2">
          {/* Custom Styled Organization Switcher */}
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="relative cursor-pointer w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border shadow-sm"
            >
              <div className="flex items-center gap-2 w-full">
                <Avatar className="h-8 w-8 rounded-md border">
                  <AvatarImage
                    src={organization?.imageUrl}
                    alt={organization?.name || "Workspace"}
                  />
                  <AvatarFallback className="rounded-md bg-transparent">
                    {organization?.name?.charAt(0) || "W"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight z-0">
                  <span className="truncate font-semibold">
                    {organization?.name || "Select Workspace"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {organization ? "Workspace" : "Personal"}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 z-0 text-muted-foreground" />
              </div>
              <div className="absolute inset-0 opacity-0 z-10 w-full h-full">
                <OrganizationSwitcher
                  hidePersonal={true}
                  createOrganizationUrl="/create-org"
                  afterCreateOrganizationUrl="/"
                  afterSelectOrganizationUrl="/"
                  afterLeaveOrganizationUrl="/"
                  appearance={{
                    elements: {
                      rootBox: "w-full h-full flex items-center justify-center",
                      organizationSwitcherTrigger: "w-full h-full opacity-0",
                    },
                  }}
                />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Custom Styled User Button */}
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="relative cursor-pointer w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <div className="flex items-center gap-2 w-full">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={user?.imageUrl}
                    alt={user?.fullName || "User"}
                  />
                  <AvatarFallback className="rounded-lg">
                    {user?.firstName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight z-0">
                  <span className="truncate font-semibold">
                    {user?.fullName || "User"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.primaryEmailAddress?.emailAddress}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 z-0 text-muted-foreground" />
              </div>
              <div className="absolute inset-0 opacity-0 z-10 w-full h-full">
                <UserButton
                  appearance={{
                    elements: {
                      rootBox: "w-full h-full flex items-center justify-center",
                      userButtonTrigger: "w-full h-full opacity-0",
                    },
                  }}
                />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

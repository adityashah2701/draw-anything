"use client";

import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  CreditCard,
  LayoutGrid,
  LogOut,
  PencilRuler,
  Plus,
  Settings2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { LogoMark } from "@/components/shared/logo-mark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface SidebarWorkspace {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface SidebarUser {
  name: string;
  email?: string;
  imageUrl?: string;
}

export interface SidebarBoard {
  id: string;
  title: string;
}

export interface SidebarActions {
  switchWorkspace: (id: string) => void;
  createWorkspace: () => void;
  manageWorkspace: () => void;
  manageAccount: () => void;
  signOut: () => void;
  openBoard: (id: string) => void;
}

interface SidebarViewProps extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  selectedPage: string;
  onNavigate: (page: string) => void;
  /** The active workspace, or null while none is chosen. */
  workspace: SidebarWorkspace | null;
  membersCount?: number;
  workspaces: SidebarWorkspace[];
  user: SidebarUser;
  /** Newest first; the sidebar shows the first few. */
  recent: SidebarBoard[];
  actions: SidebarActions;
}

const RECENT_LIMIT = 5;

const PRIMARY_NAV: { icon: LucideIcon; label: string }[] = [
  { icon: LayoutGrid, label: "Dashboard" },
  { icon: PencilRuler, label: "Whiteboards" },
];

const ORGANIZATION_NAV: { icon: LucideIcon; label: string }[] = [
  { icon: Users, label: "Members" },
  { icon: CreditCard, label: "Billing" },
];

// One recipe for every row. The ink bar is the margin mark of the current page; it scales in rather than fading,
// so it reads as the page "taking" the selection.
const navButton = cn(
  "relative text-sidebar-foreground/80 hover:text-sidebar-foreground",
  "[&>svg]:text-muted-foreground [&>svg]:[stroke-width:1.75] hover:[&>svg]:text-sidebar-foreground",
  "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded-full before:bg-sidebar-primary",
  "before:transition-transform before:duration-150 before:ease-(--ease-out-strong) motion-reduce:before:transition-none",
  "data-[active=true]:text-sidebar-foreground data-[active=true]:before:scale-y-100 data-[active=true]:[&>svg]:text-sidebar-primary",
);

// Footer rows sit flush: no border, the hover fill and the open state are the only containers.
const footerButton = cn(
  "h-10 gap-2.5 px-2 group-data-[collapsible=icon]:p-1!",
  "data-[state=open]:bg-sidebar-accent",
);

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function WorkspaceMark({ workspace, className }: { workspace: { name: string; imageUrl?: string } | null; className?: string }) {
  return (
    <Avatar aria-hidden className={cn("size-6 rounded-[4px]", className)}>
      {workspace?.imageUrl && <AvatarImage src={workspace.imageUrl} alt="" />}
      <AvatarFallback className="rounded-[4px] bg-sidebar-accent font-mono text-[11px] font-semibold text-sidebar-foreground">
        {workspace ? initial(workspace.name) : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

function UserMark({ user, className }: { user: SidebarUser; className?: string }) {
  return (
    <Avatar aria-hidden className={cn("size-6", className)}>
      {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback className="bg-sidebar-accent text-[11px] font-medium text-sidebar-foreground">{initial(user.name)}</AvatarFallback>
    </Avatar>
  );
}

function NavGroup({
  label,
  items,
  selectedPage,
  onNavigate,
  badges,
}: {
  label?: string;
  items: { icon: LucideIcon; label: string }[];
  selectedPage: string;
  onNavigate: (page: string) => void;
  badges?: Record<string, number | undefined>;
}) {
  return (
    <SidebarGroup className="px-2 py-1.5">
      {label && <SidebarGroupLabel className="label-mono h-6 px-2 text-muted-foreground group-data-[collapsible=icon]:-mt-6 group-data-[collapsible=icon]:pointer-events-none">{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => {
            const active = selectedPage === item.label;
            const badge = badges?.[item.label];
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  className={navButton}
                  isActive={active}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.label)}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {typeof badge === "number" && <SidebarMenuBadge className="label-mono top-2.5! right-2 h-auto min-w-0 px-0 text-muted-foreground">{badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function WorkspaceMenu({
  workspace,
  membersCount,
  workspaces,
  actions,
  menuSide,
}: Pick<SidebarViewProps, "workspace" | "membersCount" | "workspaces" | "actions"> & { menuSide: "top" | "right" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className={footerButton} tooltip={workspace?.name ?? "Select workspace"} aria-label={`Workspace: ${workspace?.name ?? "none selected"}. Switch workspace`}>
          <WorkspaceMark workspace={workspace} />
          <span className="grid min-w-0 flex-1 gap-1 text-left">
            <span className="truncate text-[13px] leading-none font-medium text-sidebar-foreground">{workspace?.name ?? "Select workspace"}</span>
            <span className="label-mono truncate">
              {workspace ? (typeof membersCount === "number" ? `${membersCount} ${membersCount === 1 ? "member" : "members"}` : "Workspace") : "No workspace"}
            </span>
          </span>
          <ChevronsUpDown className="ml-auto size-3.5! text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={menuSide} align={menuSide === "top" ? "start" : "end"} sideOffset={8} className="w-60">
        <DropdownMenuLabel className="label-mono px-2 py-1.5 font-normal">Workspaces</DropdownMenuLabel>
        {workspaces.length === 0 && <p className="px-2 py-1.5 text-[13px] text-muted-foreground">You are not in a workspace yet.</p>}
        {workspaces.map((item) => (
          <DropdownMenuItem key={item.id} className="gap-2.5 text-[13px]" onSelect={() => item.id !== workspace?.id && actions.switchWorkspace(item.id)}>
            <WorkspaceMark workspace={item} className="size-5" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.id === workspace?.id && <Check className="text-primary" aria-label="Current workspace" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {workspace && (
          <DropdownMenuItem className="text-[13px]" onSelect={actions.manageWorkspace}>
            <Settings2 /> Manage workspace
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-[13px]" onSelect={actions.createWorkspace}>
          <Plus /> Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({ user, actions, menuSide }: Pick<SidebarViewProps, "user" | "actions"> & { menuSide: "top" | "right" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className={cn(footerButton, "h-9")} tooltip={user.name} aria-label={`Account: ${user.name}. Open account menu`}>
          <UserMark user={user} />
          <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-sidebar-foreground">{user.name}</span>
          <ChevronsUpDown className="ml-auto size-3.5! text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={menuSide} align={menuSide === "top" ? "start" : "end"} sideOffset={8} className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <UserMark user={user} className="size-8" />
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-[13px] leading-none font-medium">{user.name}</span>
            {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[13px]" onSelect={actions.manageAccount}>
          <UserCog /> Manage account
        </DropdownMenuItem>
        <DropdownMenuItem className="text-[13px]" onSelect={actions.signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The dashboard's navigation, as a fixed rail that collapses to icons. Presentational: the container
 * (`AppSidebar`) owns Clerk and Convex, so this renders from plain props and can be driven in tests.
 */
export function SidebarView({ selectedPage, onNavigate, workspace, membersCount, workspaces, user, recent, actions, ...props }: SidebarViewProps) {
  const { state, isMobile } = useSidebar();
  const menuSide = state === "collapsed" && !isMobile ? "right" : "top";
  const boards = recent.slice(0, RECENT_LIMIT);

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Same height and rule as the top bar, so the line runs unbroken across the page. */}
      <SidebarHeader className="h-12 flex-row items-center gap-2.5 border-b p-0 px-3">
        <LogoMark />
        <span className="truncate text-[13px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Draw Anything</span>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1.5" role="navigation" aria-label="Main">
        <NavGroup items={PRIMARY_NAV} selectedPage={selectedPage} onNavigate={onNavigate} />
        <NavGroup label="Organization" items={ORGANIZATION_NAV} selectedPage={selectedPage} onNavigate={onNavigate} badges={{ Members: membersCount }} />

        {boards.length > 0 && (
          <SidebarGroup className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="label-mono h-6 px-2 text-muted-foreground">Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenuSub className="mx-4 gap-0.5 px-0">
                {boards.map((board) => (
                  <SidebarMenuSubItem key={board.id}>
                    <SidebarMenuSubButton
                      asChild
                      className="h-7 translate-x-0 px-2.5 text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground motion-reduce:transition-none"
                    >
                      <a
                        href={`/whiteboard/${board.id}`}
                        title={board.title}
                        onClick={(event) => {
                          // Keep new-tab and modified clicks native; route the plain click without a page load.
                          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                          event.preventDefault();
                          actions.openBoard(board.id);
                        }}
                      >
                        <span>{board.title || "Untitled"}</span>
                      </a>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-0.5 border-t p-2">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <WorkspaceMenu workspace={workspace} membersCount={membersCount} workspaces={workspaces} actions={actions} menuSide={menuSide} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <AccountMenu user={user} actions={actions} menuSide={menuSide} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

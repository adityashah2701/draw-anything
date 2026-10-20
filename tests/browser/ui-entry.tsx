// Bundled for the browser by harness.ts when a test asks for `ui: true`: real components on window.U.
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AIPanel } from "@/features/whiteboard/components/overlays/ai-panel";
import { Toaster } from "@/components/ui/sonner";
import { SidebarView } from "@/components/layout/sidebar/sidebar-view";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { AgentUiMessage } from "@/features/canvas-tools/editor/use-canvas-agent";
import { TeamView } from "@/features/team/components/team-view";
import type { TeamInvite, TeamMember } from "@/features/team/team-model";
import { ExportDialog } from "@/features/whiteboard/components/overlays/export-dialog";
import { useBoardExport } from "@/features/whiteboard/hooks/export/use-board-export";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const ExportHarness = ({ elements, selectedIds }: { elements: DrawingElement[]; selectedIds: string[] }) => {
  const [open, setOpen] = useState(true);
  const exporter = useBoardExport({ elements, selectedIds, title: "Test Board" });
  return (
    <>
      <button onClick={() => setOpen(true)}>Open export</button>
      <ExportDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        selectedCount={selectedIds.length}
        isExporting={exporter.isExporting}
        onExport={exporter.exportFile}
        onCopy={exporter.copyImage}
        onCopySvg={exporter.copySvg}
        onCancelExport={exporter.cancel}
      />
    </>
  );
};

let mounted: { root: Root; host: HTMLElement } | null = null;

/** Replaces any previous mount, unmounting it properly so its dialog releases the page. */
export const mountExport = (elements: DrawingElement[], selectedIds: string[]) => {
  if (mounted) {
    mounted.root.unmount();
    mounted.host.remove();
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = { root, host };
  root.render(<ExportHarness elements={elements} selectedIds={selectedIds} />);
};

// ── the agent panel, with a fake board agent that records what the panel sends ───────────────────────

interface Sent {
  text: string;
  provider?: string;
  model?: string;
  images: string[];
}

const AgentPanelHarness = ({ initial, running }: { initial: AgentUiMessage[]; running: boolean }) => {
  const [messages, setMessages] = useState<AgentUiMessage[]>(initial);
  const agent = {
    messages,
    shared: true,
    lockedBy: null,
    activity: null,
    running,
    confirmation: null,
    canUndoRun: false,
    resolveConfirmation: () => {},
    stop: () => {},
    clear: () => setMessages([]),
    undoRun: async () => {},
    send: async (text: string, provider?: string, model?: string, images: string[] = []) => {
      ((window as unknown as { __sent?: Sent[] }).__sent ??= []).push({ text, provider, model, images });
      setMessages((prev) => [...prev, { id: `u${prev.length}`, kind: "user", text, ...(images.length ? { images: images.length, previews: images } : {}) }]);
    },
  };
  return (
    <>
      <AIPanel
        isOpen
        onClose={() => {}}
        triggerAIGeneration={() => {}}
        isGenerating={false}
        messages={[]}
        workingLabel={null}
        onClear={() => {}}
        onOpenCode={() => {}}
        onFitToScreen={() => {}}
        canvasAgent={agent as never}
      />
      <Toaster />
    </>
  );
};

let panel: { root: Root; host: HTMLElement } | null = null;

export const mountAgentPanel = (initial: AgentUiMessage[] = [], running = false) => {
  if (panel) {
    panel.root.unmount();
    panel.host.remove();
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  panel = { root, host };
  root.render(<AgentPanelHarness initial={initial} running={running} />);
};

// ── the dashboard sidebar, driven from fixtures (Clerk and Convex do not run in a test page) ─────────

const SidebarHarness = ({ onEvent }: { onEvent: (event: string) => void }) => {
  const [page, setPage] = useState("Dashboard");
  const [workspaceId, setWorkspaceId] = useState("org_1");
  const workspaces = [
    { id: "org_1", name: "Northwind Studio" },
    { id: "org_2", name: "Side projects" },
  ];
  const record = (name: string) => () => onEvent(name);
  return (
    <SidebarProvider>
      <SidebarView
        selectedPage={page}
        onNavigate={(next) => {
          setPage(next);
          onEvent(`nav:${next}`);
        }}
        workspace={workspaces.find((w) => w.id === workspaceId) ?? null}
        membersCount={4}
        workspaces={workspaces}
        user={{ name: "Aditya Shah", email: "aditya@example.com" }}
        recent={[
          { id: "b1", title: "Checkout service architecture" },
          { id: "b2", title: "Retro: October sprint" },
          { id: "b3", title: "A board with a name long enough that it has to truncate somewhere sensible" },
        ]}
        actions={{
          switchWorkspace: (id) => {
            setWorkspaceId(id);
            onEvent(`switch:${id}`);
          },
          createWorkspace: record("create"),
          manageWorkspace: record("manage"),
          manageAccount: record("account"),
          signOut: record("signout"),
          openBoard: (id) => onEvent(`board:${id}`),
        }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
          <SidebarTrigger className="-ml-1" />
          <span className="label-mono sr-only md:not-sr-only">{page}</span>
        </header>
        <main className="flex-1 bg-background p-6 text-sm">Canvas area</main>
      </SidebarInset>
    </SidebarProvider>
  );
};

let sidebar: { root: Root; host: HTMLElement } | null = null;

export const mountSidebar = (onEvent: (event: string) => void) => {
  if (sidebar) {
    sidebar.root.unmount();
    sidebar.host.remove();
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  sidebar = { root, host };
  root.render(<SidebarHarness onEvent={onEvent} />);
};

// ── the Team page, driven from fixtures (Clerk does not run in a test page) ───────────────────────────

interface TeamFixture {
  members?: TeamMember[];
  invites?: TeamInvite[];
  canManage?: boolean;
  loading?: boolean;
  startInviting?: boolean;
  /** Make the named action reject, to exercise error handling. */
  failing?: string[];
}

const day = 86_400_000;
const teamMembers = (): TeamMember[] => [
  { id: "m1", userId: "u1", name: "Aditya Shah", email: "aditya@example.com", role: "org:admin", joinedAt: new Date(Date.now() - 90 * day) },
  { id: "m2", userId: "u2", name: "Grace Hopper", email: "grace@navy.example", role: "org:member", joinedAt: new Date(Date.now() - 40 * day) },
  { id: "m3", userId: "u3", name: "Ada Lovelace with a rather long display name that must truncate", email: "ada.lovelace.with.a.very.long.address@analytical-engine.example", role: "org:admin", joinedAt: new Date(Date.now() - 12 * day) },
];
const teamInvites = (): TeamInvite[] => [
  { id: "i1", email: "linus@example.com", role: "org:member", createdAt: new Date(Date.now() - 3 * day) },
  { id: "i2", email: "margaret@example.com", role: "org:admin", createdAt: new Date(Date.now() - 2 * 3_600_000) },
];

const TeamHarness = ({ fixture, onEvent }: { fixture: TeamFixture; onEvent: (event: string) => void }) => {
  const [members, setMembers] = useState(fixture.members ?? teamMembers());
  const [invites, setInvites] = useState(fixture.invites ?? teamInvites());
  const [name, setName] = useState("Northwind Studio");
  const [hasImage, setHasImage] = useState(false);
  const attempt = async (action: string, run: () => void) => {
    onEvent(action);
    await new Promise((r) => setTimeout(r, 60));
    if (fixture.failing?.includes(action)) throw { errors: [{ longMessage: `${action} was refused by the fixture` }] };
    run();
  };
  return (
    <SidebarProvider>
      <SidebarView
        selectedPage="Members"
        onNavigate={() => {}}
        workspace={{ id: "org_1", name }}
        membersCount={members.length}
        workspaces={[{ id: "org_1", name }]}
        user={{ name: "Aditya Shah", email: "aditya@example.com" }}
        recent={[]}
        actions={{ switchWorkspace: () => {}, createWorkspace: () => {}, manageWorkspace: () => {}, manageAccount: () => {}, signOut: () => {}, openBoard: () => {} }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
          <SidebarTrigger className="-ml-1" />
          <span className="label-mono sr-only md:not-sr-only">Members</span>
        </header>
        <main className="flex-1 overflow-auto bg-background">
          <TeamView
            workspace={{ name, hasImage, imageUrl: hasImage ? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='%23345'/></svg>" : undefined }}
            members={members}
            invites={invites}
            currentUserId="u1"
            canManage={fixture.canManage ?? true}
            loading={fixture.loading}
            startInviting={fixture.startInviting}
            actions={{
              invite: (emails, role) =>
                attempt(`invite:${role}:${emails.join("|")}`, () =>
                  setInvites((prev) => [...emails.map((email, i) => ({ id: `n${prev.length + i}`, email, role, createdAt: new Date() })), ...prev]),
                ),
              changeRole: (member, role) => attempt(`role:${member.userId}:${role}`, () => setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)))),
              removeMember: (member) => attempt(`remove:${member.userId}`, () => setMembers((prev) => prev.filter((m) => m.id !== member.id))),
              revokeInvite: (invite) => attempt(`revoke:${invite.id}`, () => setInvites((prev) => prev.filter((i) => i.id !== invite.id))),
              rename: (next) => attempt(`rename:${next}`, () => setName(next)),
              setLogo: (file) => attempt(`logo:${file ? file.name : "none"}`, () => setHasImage(!!file)),
              leave: () => attempt("leave", () => {}),
              deleteWorkspace: () => attempt("delete", () => {}),
              openAdvanced: () => onEvent("advanced"),
            }}
          />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
};

let team: { root: Root; host: HTMLElement } | null = null;

export const mountTeam = (fixture: TeamFixture, onEvent: (event: string) => void) => {
  if (team) {
    team.root.unmount();
    team.host.remove();
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  team = { root, host };
  root.render(<TeamHarness fixture={fixture} onEvent={onEvent} />);
};

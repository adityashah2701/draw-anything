// Bundled for the browser by harness.ts when a test asks for `ui: true`: real components on window.U.
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AIPanel } from "@/features/whiteboard/components/overlays/ai-panel";
import { Toaster } from "@/components/ui/sonner";
import { SidebarView } from "@/components/layout/sidebar/sidebar-view";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { AgentUiMessage } from "@/features/canvas-tools/editor/use-canvas-agent";
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

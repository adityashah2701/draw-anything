"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { ApplyDiagramCodePayload } from "@/features/diagram-code/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { AGENT_WIDTH_CSS, CODE_WIDTH_CSS } from "@/features/whiteboard/components/overlays/panel-layout";
import { DiagramCodeEditor } from "@/features/whiteboard/components/overlays/diagram-code-editor";

interface DiagramCodePanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The agent panel is open on the right edge: sit beside it, not under it. */
  agentOpen: boolean;
  elements: DrawingElement[];
  selectedElementIds: string[];
  onApply: (payload: ApplyDiagramCodePayload) => void;
  loadToken: number;
  disabled?: boolean;
}

/**
 * The diagram as code, in a panel of its own: open it from the sidebar, the command menu or the agent,
 * write or paste code, and draw it. It does not depend on the agent being open.
 */
export const DiagramCodePanel: React.FC<DiagramCodePanelProps> = ({ isOpen, onClose, agentOpen, elements, selectedElementIds, onApply, loadToken, disabled }) => {
  // Stay mounted while closed so the code being written survives closing the panel.
  return (
    <aside
      role="complementary"
      aria-label="Diagram code"
      aria-hidden={!isOpen}
      hidden={!isOpen}
      className={`fixed bottom-0 top-0 z-50 ${isOpen ? "flex" : "hidden"} max-w-[100vw] flex-col border-l border-border bg-card text-card-foreground shadow-popover animate-in slide-in-from-right duration-150`}
      style={{ right: agentOpen ? AGENT_WIDTH_CSS : 0, width: CODE_WIDTH_CSS }}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border pl-5 pr-2">
        <div>
          <h2 className="text-[13px] font-semibold leading-none">Diagram code</h2>
          <p className="mt-1 font-mono text-[11px] leading-none text-muted-foreground">Write it, or load what is on the canvas</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the code editor"
          title="Close the code editor"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={15} />
        </button>
      </header>
      <DiagramCodeEditor elements={elements} selectedElementIds={selectedElementIds} onApply={onApply} disabled={disabled} loadToken={loadToken} />
    </aside>
  );
};

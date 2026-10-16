// Bundled for the browser by harness.ts when a test asks for `ui: true`: real components on window.U.
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
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

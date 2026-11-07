import { useCallback } from "react";
import type { DocPatch } from "@/core/groups/patch";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import type { ApplyDiagramCodePayload } from "@/features/diagram-code/types";
import { planDiagramCode, shiftElement } from "./diagram-placement";
import { newDiagramPatch } from "@/features/whiteboard/commands/layout-engine";
import { coveredByPanels } from "@/features/whiteboard/components/overlays/panel-layout";
import type { useCanvasViewport } from "@/features/whiteboard/hooks/canvas/use-canvas-viewport";

export interface UseDiagramCodeSyncProps {
  elements: DrawingElement[];
  hasEditAccess: boolean;
  gestureHistory: { begin: () => void; end: () => void };
  applyDocPatch: (patch: DocPatch) => void;
  deleteElementsLive: (ids: string[]) => void;
  setSelectedElements: (updater: (prev: string[]) => string[]) => void;
  canvasViewport: ReturnType<typeof useCanvasViewport>;
  showAIModal: boolean;
  showCodePanel: boolean;
}

export function useDiagramCodeSync({
  elements,
  hasEditAccess,
  gestureHistory,
  applyDocPatch,
  deleteElementsLive,
  setSelectedElements,
  canvasViewport,
  showAIModal,
  showCodePanel,
}: UseDiagramCodeSyncProps) {
  const applyDiagramCode = useCallback(
    ({ elements: next, replaceIds, anchored, patch, placements, familyEngine }: ApplyDiagramCodePayload) => {
      if (!hasEditAccess) return;

      // An update planned against the board: same elements, only what changed, one undo step.
      if (patch) {
        if (patch.add.length === 0 && patch.update.length === 0 && patch.remove.length === 0) return;
        gestureHistory.begin();
        try {
          applyDocPatch({ add: patch.add, update: patch.update, remove: patch.remove, origin: "layout", placements } as unknown as DocPatch);
        } finally {
          gestureHistory.end();
        }
        if (patch.remove.length > 0) setSelectedElements((prev) => prev.filter((id) => !patch.remove.includes(id)));
        return;
      }

      if (next.length === 0) return;

      const replaced = elements.filter((element) => replaceIds.includes(element.id));
      const { shift, fit } = planDiagramCode({ next, replaced, anchored: Boolean(anchored), viewport: canvasViewport });

      gestureHistory.begin();
      try {
        if (replaced.length > 0) deleteElementsLive(replaced.map((element) => element.id));
        // One patch: a diagram the code laid out is `auto` (explicit positions in the code are `user`), and is stored with its layout record.
        const placed = next.map((element) => ({ ...element, points: shiftElement(element, shift).points }) as DrawingElement);
        applyDocPatch({ ...newDiagramPatch(placed, undefined, familyEngine === true), placements } as unknown as DocPatch);
      } finally {
        gestureHistory.end();
      }

      setSelectedElements((prev) => prev.filter((id) => !replaceIds.includes(id)));
      if (fit) setTimeout(() => canvasViewport.fitToBounds(fit, { rightInset: coveredByPanels(showAIModal, showCodePanel) }), 0);
    },
    [
      applyDocPatch,
      canvasViewport,
      deleteElementsLive,
      elements,
      gestureHistory,
      hasEditAccess,
      setSelectedElements,
      showAIModal,
      showCodePanel,
    ],
  );

  return { applyDiagramCode };
}


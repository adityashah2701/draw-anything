import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  DrawingElement,
  WhiteboardData,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  type AutosaveController,
  type AutosaveStatus,
  createAutosaveController,
} from "./autosave-controller";

interface UseWhiteboardAutoSaveProps {
  whiteboardId: string;
  elements: DrawingElement[];
  hasEditAccess: boolean;
  /**
   * True once the live document is loaded AND the stored snapshot has been
   * merged into it. Until then the board may look empty without being empty,
   * so nothing is tracked and nothing can be saved over the stored content.
   */
  ready: boolean;
  /** False while a drag/draw/resize is in progress; saves wait for it to end. */
  canSave: boolean;

  // Canvas settings saved along with the elements
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;

  whiteboard?: { _creationTime?: number } | null;
}

const isPermissionError = (error: unknown) =>
  /unauthorized|permission/i.test(
    error instanceof Error ? error.message : String(error),
  );

export const useWhiteboardAutoSave = ({
  whiteboardId,
  elements,
  hasEditAccess,
  ready,
  canSave,
  zoom,
  panOffset,
  showGrid,
  whiteboard,
}: UseWhiteboardAutoSaveProps) => {
  const [status, setStatus] = useState<AutosaveStatus>({
    isSaving: false,
    hasPendingChanges: false,
    lastSavedAt: null,
    error: null,
  });
  const updateWhiteboard = useMutation(api.whiteboard.update);

  // The save callback must always see the newest board, not the one captured
  // when the controller was created.
  const latest = useRef({ elements, zoom, panOffset, showGrid, whiteboard });
  const updateRef = useRef(updateWhiteboard);
  const statusRef = useRef(status);
  const controllerRef = useRef<AutosaveController | null>(null);
  const reportedErrorRef = useRef<unknown>(null);
  useEffect(() => {
    latest.current = { elements, zoom, panOffset, showGrid, whiteboard };
    updateRef.current = updateWhiteboard;
  });

  useEffect(() => {
    if (!whiteboardId || !hasEditAccess) return;

    const controller = createAutosaveController({
      save: async () => {
        const current = latest.current;
        const data: WhiteboardData = {
          elements: current.elements,
          canvasSettings: {
            zoom: current.zoom,
            panOffset: current.panOffset,
            showGrid: current.showGrid,
          },
          metadata: {
            version: "1.0.0",
            createdAt: current.whiteboard?._creationTime ?? new Date().toISOString(),
            lastModified: new Date().toISOString(),
          },
        };
        await updateRef.current({
          id: whiteboardId as Id<"whiteboards">,
          content: JSON.stringify(data),
        });
      },
      isFatal: isPermissionError,
      onStatus: (next) => {
        statusRef.current = next;
        setStatus(next);
        // Tell the user once per failure, not on every retry.
        if (next.error && reportedErrorRef.current !== next.error) {
          reportedErrorRef.current = next.error;
          if (isPermissionError(next.error)) {
            toast("You don't have permission to edit this whiteboard. It may belong to a different organization.");
          } else {
            toast.error("Couldn't save the whiteboard. Retrying…");
          }
        }
        if (!next.error) reportedErrorRef.current = null;
      },
    });
    controllerRef.current = controller;

    // Last chance to persist: the tab is hiding or closing.
    const flushNow = () => void controller.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      controllerRef.current = null;
      void controller.flush().finally(() => controller.dispose());
    };
  }, [whiteboardId, hasEditAccess]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!ready) {
      controller.observe(null);
      return;
    }
    controller.setCanSave(canSave);
    // Serializing a large board on every frame of a drag is wasted work.
    if (canSave) controller.observe(JSON.stringify(elements));
  }, [elements, ready, canSave, hasEditAccess, whiteboardId]);

  // Manual save (Ctrl+S / menu): write now, even if nothing looks changed.
  const saveWhiteboard = useCallback(async () => {
    if (!hasEditAccess) {
      toast("You don't have permission to save this whiteboard.");
      return;
    }
    const controller = controllerRef.current;
    if (!controller || !ready) {
      toast("The whiteboard is still loading.");
      return;
    }
    await controller.flush({ force: true });
    if (statusRef.current.error) {
      toast.error("Couldn't save the whiteboard.");
    } else {
      toast.success("Whiteboard saved successfully!");
    }
  }, [hasEditAccess, ready]);

  return {
    isSaving: status.isSaving,
    lastSaved: status.lastSavedAt === null ? null : new Date(status.lastSavedAt),
    hasPendingChanges: status.hasPendingChanges,
    saveError: status.error,
    saveWhiteboard,
  };
};

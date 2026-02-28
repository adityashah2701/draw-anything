import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { DrawingElement, WhiteboardData } from "@/features/whiteboard/types/whiteboard.types";

interface UseWhiteboardAutoSaveProps {
  whiteboardId: string;
  elements: DrawingElement[];
  hasEditAccess: boolean;
  isDrawing: boolean;
  currentElement: DrawingElement | null;
  
  // Canvas settings for saving
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;
  
  // Whiteboard metadata
  whiteboard?: any
}

export const useWhiteboardAutoSave = ({
  whiteboardId,
  elements,
  hasEditAccess,
  isDrawing,
  currentElement,
  zoom,
  panOffset,
  showGrid,
  whiteboard,
}: UseWhiteboardAutoSaveProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Refs to track state for auto-save logic
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastElementsCountRef = useRef(0);
  
  // Convex mutation
  const updateWhiteboard = useMutation(api.whiteboard.update);

  // Core save function
  const saveToConvex = useCallback(async () => {
    if (!whiteboardId || isSaving || !hasEditAccess) return;

    setIsSaving(true);
    try {
      const whiteboardData: WhiteboardData = {
        elements,
        canvasSettings: {
          zoom,
          panOffset,
          showGrid,
        },
        metadata: {
          version: "1.0.0",
          createdAt: whiteboard?._creationTime || new Date().toISOString(),
          lastModified: new Date().toISOString(),
        },
      };

      await updateWhiteboard({
        id: whiteboardId as Id<"whiteboards">,
        content: JSON.stringify(whiteboardData),
      });

      setLastSaved(new Date());
      lastElementsCountRef.current = elements.length;
      console.log("Whiteboard saved successfully!");
    } catch (error: any) {
      console.error("Failed to save whiteboard:", error);

      if (error.message?.includes("Unauthorized")) {
        toast("You don't have permission to edit this whiteboard. It may belong to a different organization.");
      } else {
        toast.error("Failed to save whiteboard. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    whiteboardId,
    elements,
    zoom,
    panOffset,
    showGrid,
    updateWhiteboard,
    isSaving,
    whiteboard,
    hasEditAccess,
  ]);

  // Manual save function
  const saveWhiteboard = useCallback(async () => {
    if (!hasEditAccess) {
      toast("You don't have permission to save this whiteboard.");
      return;
    }

    // Cancel auto-save timeout when manually saving
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    await saveToConvex();
    toast.success("Whiteboard saved successfully!");
  }, [saveToConvex, hasEditAccess]);

  // Auto-save logic with improved conflict prevention
  useEffect(() => {
    if (!whiteboardId || !hasEditAccess || isDrawing || currentElement) {
      return; // Don't auto-save while drawing or if no edit access
    }

    // Only auto-save if the elements count has actually changed
    if (elements.length === lastElementsCountRef.current) {
      return;
    }

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveToConvex();
      lastElementsCountRef.current = elements.length;
    }, 10); // 10ms debounce to reduce conflicts

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [elements, whiteboardId, hasEditAccess, isDrawing, currentElement, saveToConvex]);

  // Load whiteboard content
  const loadWhiteboardContent = useCallback((content: string) => {
    try {
      const whiteboardData: WhiteboardData = JSON.parse(content);
      lastElementsCountRef.current = whiteboardData.elements?.length || 0;
      return whiteboardData;
    } catch (error) {
      console.error("Failed to parse whiteboard content:", error);
      return null;
    }
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    isSaving,
    lastSaved,
    
    // Actions
    saveWhiteboard,
    saveToConvex,
    loadWhiteboardContent,
    
    // Utils
    isAutoSaveActive: autoSaveTimeoutRef.current !== null,
  };
};
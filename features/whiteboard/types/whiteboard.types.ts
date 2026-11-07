// Whiteboard types: re-exports domain models from core/model and preserves UI-specific types

export * from "@/core/model";

import type { DrawingElement, StoredElement } from "@/core/model";

export interface CanvasState {
  elements: DrawingElement[];
  currentElementId: string | null;
}

export interface WhiteboardData {
  /** Shapes and composite-group records, exactly as stored (array order is stacking order). */
  elements: StoredElement[];
  canvasSettings: {
    zoom: number;
    panOffset: { x: number; y: number };
    showGrid: boolean;
  };
  metadata: {
    version: string;
    createdAt: string | number;
    lastModified: string;
  };
}

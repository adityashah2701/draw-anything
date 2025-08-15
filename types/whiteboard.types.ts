// Types
export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type: 'freehand' | 'rectangle' | 'circle' | 'line' | 'text' | 'arrow';
  points: Point[];
  color: string;
  strokeWidth: number;
  fill?: string;
  text?: string;
  fontSize?: number;
}

export interface CanvasState {
  elements: DrawingElement[];
  currentElementId: string | null;
}

export interface WhiteboardData {
  elements: DrawingElement[];
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

export type Tool = 'select' | 'pen' | 'rectangle' | 'circle' | 'line' | 'text' | 'eraser' | 'hand' | 'arrow';
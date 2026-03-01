// Types
export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DrawingElement {
  id: string;
  type: "freehand" | "rectangle" | "circle" | "line" | "text" | "arrow";
  points: Point[];
  color: string;
  strokeWidth: number;
  fill?: string;
  /** Embedded label rendered centered inside rectangle and circle shapes */
  label?: string;
  text?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  startConnection?: { elementId: string; handle: string };
  endConnection?: { elementId: string; handle: string };
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

export type Tool =
  | "select"
  | "pen"
  | "rectangle"
  | "circle"
  | "line"
  | "text"
  | "eraser"
  | "hand"
  | "arrow";

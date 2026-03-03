// Types
export interface Point {
  x: number;
  y: number;
}

export type ConnectionHandle = "top" | "right" | "bottom" | "left";
export type ArrowType = "arrow" | "arrow-bidirectional";
export type ArrowRoutingMode = "straight" | "orthogonal";
export type ArrowRoutePreference = "vh" | "hv";

export interface ArrowStyle {
  strokeWidth: number;
  color: string;
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
}

export interface ArrowConnection {
  elementId: string;
  handle: ConnectionHandle;
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
  type:
    | "freehand"
    | "rectangle"
    | "circle"
    | "diamond"
    | "line"
    | "text"
    | "arrow"
    | "arrow-bidirectional";
  points: Point[];
  color: string;
  strokeWidth: number;
  fill?: string;
  /** Embedded label rendered centered inside shape nodes */
  label?: string;
  text?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  startConnection?: ArrowConnection;
  endConnection?: ArrowConnection;

  /* Arrow style */
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
  routingMode?: ArrowRoutingMode;
  routePreference?: ArrowRoutePreference;
  isManuallyRouted?: boolean;
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
  | "diamond"
  | "line"
  | "text"
  | "eraser"
  | "hand"
  | "arrow"
  | "arrow-bidirectional";

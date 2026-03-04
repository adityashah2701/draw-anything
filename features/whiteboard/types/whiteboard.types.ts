// Types
export interface Point {
  x: number;
  y: number;
}

export type ConnectionHandle = "top" | "right" | "bottom" | "left";
export type AnchorSide = ConnectionHandle;
export type ArrowType = "arrow" | "arrow-bidirectional";
export type ArrowRoutingMode = "straight" | "orthogonal";
export type ArrowRoutePreference = "vh" | "hv";

export interface Anchor {
  id: string;
  x: number;
  y: number;
  side: AnchorSide;
}

export interface ArrowStyle {
  strokeWidth: number;
  color: string;
  dashed?: boolean;
  arrowHeadStart?: boolean;
  arrowHeadEnd?: boolean;
}

export interface ArrowConnection {
  elementId: string;
  anchorId?: string;
  /** Backward compatibility for older documents. */
  handle?: ConnectionHandle;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface BaseDrawingElement {
  id: string;
  type: string;
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
  /** AI-agent stamps for round-trip graph reconstruction */
  logicalId?: string;
  logicalShape?: "rectangle" | "circle" | "diamond";
  logicalLayer?: string;
  logicalColumn?: number;
  logicalFill?: string;
  logicalColor?: string;
}

export interface FreehandShape extends BaseDrawingElement {
  type: "freehand";
}

export interface RectangleShape extends BaseDrawingElement {
  type: "rectangle";
}

export interface CircleShape extends BaseDrawingElement {
  type: "circle";
}

export interface DiamondShape extends BaseDrawingElement {
  type: "diamond";
}

export interface LineShape extends BaseDrawingElement {
  type: "line";
}

export interface TextShape extends BaseDrawingElement {
  type: "text";
  text?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
}

export interface ArrowBaseShape extends BaseDrawingElement {
  type: "arrow" | "arrow-bidirectional";
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

export interface ArrowShape extends ArrowBaseShape {
  type: "arrow";
}

export interface BidirectionalArrowShape extends ArrowBaseShape {
  type: "arrow-bidirectional";
}

export type DrawingElement =
  | FreehandShape
  | RectangleShape
  | CircleShape
  | DiamondShape
  | LineShape
  | TextShape
  | ArrowShape
  | BidirectionalArrowShape;

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

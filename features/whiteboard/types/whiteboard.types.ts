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
  /** Annotations (group frames, labels) that are not shapes to connect to or route around. */
  isGuide?: boolean;
  ai?: {
    frameId?: string;
    generationId?: string;
    semanticId?: string;
    semanticKind?: string;
    /** Icon registry id; absent on older boards, which fall back to `semanticKind`. */
    icon?: string;
    /** A user-supplied icon stored with the element (validated on read, see core/icons/custom-icon.ts). */
    customIcon?: {
      id: string;
      title: string;
      paths: string[];
      viewBox: { width: number; height: number };
      style?: "stroke" | "logo";
      color?: string;
      strokeWidth?: number;
    };
    diagramType?: string;
    /** What a generated element is, so later edits can find or replace it. */
    role?: "node" | "edge" | "group" | "group-label" | "edge-label";
  };
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

/** A box-fitted ellipse. `circle` (centre + radius) stays for boards saved before it. */
export interface EllipseShape extends BaseDrawingElement {
  type: "ellipse";
}

/** A standalone glyph from the icon registry or the user's own (see `ai.icon` / `ai.customIcon`), with no node box. */
export interface IconShape extends BaseDrawingElement {
  type: "icon";
}

export interface DiamondShape extends BaseDrawingElement {
  type: "diamond";
}

/** Terminator: a rectangle with fully rounded ends. Used for flowchart start and end. */
export interface PillShape extends BaseDrawingElement {
  type: "pill";
}

export interface TriangleShape extends BaseDrawingElement {
  type: "triangle";
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

export interface SemanticNodeShape extends BaseDrawingElement {
  type: "semantic-node";
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
  | PillShape
  | EllipseShape
  | IconShape
  | TriangleShape
  | LineShape
  | TextShape
  | SemanticNodeShape
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

export type Tool = string;

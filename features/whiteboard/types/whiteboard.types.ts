// Types
export interface Point {
  x: number;
  y: number;
}

export type ConnectionHandle = "top" | "right" | "bottom" | "left";
export type AnchorSide = ConnectionHandle;
export type ArrowType = "arrow" | "arrow-bidirectional";
export type ArrowRoutingMode = "straight" | "orthogonal" | "curved";
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
  /**
   * Parent composite group (see `GroupRecord`). Absent = top level. A dangling or cyclic value is
   * treated as "ungrouped" by `core/groups/group-index.ts`, never as an error.
   */
  groupId?: string;
  /**
   * The frame that owns this element (see `FrameShape`, `core/frames`). Absent = top level. Ownership
   * lives only here: a frame stores no list of its contents. Groups and frames are independent (an
   * element can have both a `groupId` and a `frameId`). A dangling or cyclic value is read as "not in
   * a frame", never as an error. Not related to `ai.frameId`, which names an AI generation.
   */
  frameId?: string;
  /** Locked elements (and everything inside a locked group) can be selected but not edited. */
  locked?: boolean;
  /**
   * Hidden elements (and everything inside a hidden group) are not drawn, hit-tested or exported, but stay in
   * the document, its history and its connections; showing them again changes nothing else. A connector
   * with a hidden end is hidden with it (derived, see `core/groups/visibility.ts`).
   */
  hidden?: boolean;
  /** 0 (invisible) to 1 (opaque); absent = 1. Applies to the element's whole drawing, label included. */
  opacity?: number;
  /**
   * Clockwise degrees about the centre of the unrotated shape; absent = 0. Only shapes that declare
   * the `rotatable` capability honour it (see `core/shapes/capabilities/rotatable.ts`).
   */
  rotation?: number;
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
  /** Corner radius in world units; absent = the standard rectangle radius (6). 0 is square. */
  cornerRadius?: number;
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

/** Where a semantic node's icon sits relative to its label. Absent = chosen from the node's proportions. */
export type SemanticIconPlacement = "left" | "right" | "top";

/**
 * Presentation of a semantic node beyond its fill, stroke and text (see core/shapes/semantic-node/style.ts).
 * Every field is optional and an absent field means "the design default", so boards saved before this
 * existed draw exactly as they should. Unknown or out-of-range values are ignored on read, never trusted.
 */
export interface SemanticNodeStyle {
  /** The icon is removed (the label then takes the whole node). */
  iconHidden?: boolean;
  /** Edge of the icon tile in world units; absent = sized from the node. */
  iconSize?: number;
  iconPlacement?: SemanticIconPlacement;
  /** `#rrggbb` tint for a line icon; brand marks keep their own colours. */
  iconColor?: string;
  /** Corner radius in world units. */
  cornerRadius?: number;
  /**
   * What the node's icon was before the user replaced it, so "restore default" can bring it back: the
   * registry id it named, or `null` when it had none (it drew the icon its kind implies).
   */
  originalIcon?: string | null;
}

export interface SemanticNodeShape extends BaseDrawingElement {
  type: "semantic-node";
  nodeStyle?: SemanticNodeStyle;
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

/** Where a frame's title sits: in a band at the top of the frame, or on a tab above it. */
export type FrameTitlePlacement = "inside" | "above";

/** Named starting points for a frame; each only sets defaults (see `core/frames/presets.ts`). */
export type FramePreset = "section" | "container" | "feature-group" | "swimlane" | "device";

/**
 * A frame: a titled region that owns the elements placed in it (see `core/frames`). `points` are the
 * two corners of its box, `color` is its border, `fill` its background (absent = transparent) and
 * `opacity` applies to the whole frame. Every other field is optional and an absent field means the
 * design default, so a frame written by an older build still reads correctly.
 */
export interface FrameShape extends BaseDrawingElement {
  type: "frame";
  title?: string;
  /** Corner radius in world units; absent = the frame default. */
  cornerRadius?: number;
  /** Space kept between the box (below the header) and its contents when fitting. */
  padding?: number;
  titlePlacement?: FrameTitlePlacement;
  /** False hides the title band/tab. Absent = shown. */
  headerVisible?: boolean;
  /** The box always wraps its contents plus `padding`; it is then not resized by hand. */
  autoFit?: boolean;
  minWidth?: number;
  minHeight?: number;
  preset?: FramePreset;
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
  | FrameShape
  | ArrowShape
  | BidirectionalArrowShape;

/**
 * A composite group. It lives in the same stored list as the shapes (so serialisation, undo/redo and
 * collaboration need no second structure) but is *not* a `DrawingElement`: the editor splits the
 * stored list into shapes and group records, so renderers, export, routing and AI never see one.
 * Children keep absolute coordinates and their own ids and point back with `groupId`; a group's
 * bounds are always derived from its leaves. `points`, `color` and `strokeWidth` only satisfy the
 * storage type.
 */
export interface GroupRecord {
  id: string;
  type: "group";
  /** User-visible name; the UI shows "Group" when absent. */
  name?: string;
  locked?: boolean;
  hidden?: boolean;
  /** Parent group, for nesting. */
  groupId?: string;
  points: [];
  color: string;
  strokeWidth: number;
}

/** Everything the stored list can hold. */
export type StoredElement = DrawingElement | GroupRecord;

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

export type Tool = string;

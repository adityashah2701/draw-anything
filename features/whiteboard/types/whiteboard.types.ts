// Types
export interface Point {
  x: number;
  y: number;
}

export type ConnectionHandle = "top" | "right" | "bottom" | "left";
export type AnchorSide = ConnectionHandle;
export type ArrowType = "arrow" | "arrow-bidirectional";
export type ArrowRoutingMode = "straight" | "orthogonal" | "curved";
/** How one end of a connector is finished; see `core/shapes/arrow/arrowhead.ts`. Absent = the filled triangle. */
export type ArrowheadKind =
  | "triangle"
  | "open"
  | "hollow-triangle"
  | "diamond"
  | "diamond-filled"
  | "circle"
  | "crow-one"
  | "crow-many"
  | "crow-zero-one"
  | "crow-zero-many"
  | "crow-exactly-one"
  | "crow-one-many"
  | "cross"
  | "lollipop"
  | "socket";

/** What a connector means (see `core/shapes/arrow/relations.ts`); its line style, heads and end glyphs follow from it. */
export type RelationKind =
  | "association"
  | "directed-association"
  | "generalization"
  | "realization"
  | "dependency"
  | "aggregation"
  | "composition"
  | "er-relationship"
  | "sequence-flow"
  | "message-flow"
  | "bpmn-association"
  | "assembly"
  | "sync-message"
  | "async-message"
  | "return-message"
  | "create-message"
  | "destroy-message";
export type RelationNotation = "crows-foot" | "chen" | "uml" | "bpmn";
/** How many of the shape at the far end take part: the ER vocabulary. */
export type Cardinality = "one" | "exactly-one" | "many" | "zero-or-one" | "zero-or-many" | "one-or-many";
/** What one end of a connector says about the shape it touches. `multiplicity` is UML text such as `0..*`; both are validated, never free text. */
export interface ConnectorEnd {
  cardinality?: Cardinality;
  multiplicity?: string;
  role?: string;
}
export interface ConnectorRelation {
  kind: RelationKind;
  /** Absent = the kind's usual notation. Changing it re-draws the connector and leaves the end data alone. */
  notation?: RelationNotation;
  /** The end at the connector's first point (its source), and the end at its last point (its target). */
  start?: ConnectorEnd;
  end?: ConnectorEnd;
}
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
   * Who last set this element's position or size: `auto` (a layout engine; it may move again) or `user`
   * (a person, the AI acting for one, or explicit coordinates in diagram code; automatic layout leaves it
   * alone). **Absent reads as `user`**, so boards and shapes that predate it are never moved by an automatic
   * layout. Written only by `core/layout/placement.ts` at the storage boundary, never by a caller.
   */
  placement?: "auto" | "user";
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
    /** The direction the diagram reads in, when it is not the default top to bottom (down, right, up, left). */
    diagramDirection?: "right" | "up" | "left";
    /** What a generated element is, so later edits can find or replace it. */
    role?: "node" | "edge" | "group" | "group-label" | "edge-label" | "branch";
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

/**
 * One element type for every outline-drawn shape (cylinder, cloud, ...). `variant` names an entry of the
 * outline variant registry (core/shapes/outline/variants.ts); an id the registry does not know draws as a
 * plain rectangle. Typed as a string so data written by a newer version still loads.
 */
export interface OutlineShape extends BaseDrawingElement {
  type: "outline";
  variant: string;
  /** A second line inside the outline (double) or a heavier one (thick). Absent = a single ordinary line. */
  border?: "double" | "thick";
  /** A small glyph drawn inside the shape (see `core/shapes/outline/markers.ts`). */
  marker?: string;
  /** Drawn as a stack: two more copies behind it. */
  stack?: boolean;
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
  /** Drawn as a stack: two more copies peek out behind it (replicas, clusters). */
  stack?: boolean;
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
  /** Reach of the soft corner drawn at each bend of an orthogonal route, in world units. Absent or 0 = sharp (boards saved before corners). */
  cornerRadius?: number;
  /** The head at each end, drawn when that end's arrowhead flag is on. Absent = the filled triangle. */
  headStart?: ArrowheadKind;
  headEnd?: ArrowheadKind;
  /** What the connector means. When present it decides the line style, the heads and the end glyphs; absent = drawn from the flags above, as before. */
  relation?: ConnectorRelation;
}

export interface ArrowShape extends ArrowBaseShape {
  type: "arrow";
}

export interface BidirectionalArrowShape extends ArrowBaseShape {
  type: "arrow-bidirectional";
}

/** One column of an entity table. The id is stable: a connector attached to a row survives reordering and edits. */
export interface EntityRow {
  id: string;
  name: string;
  type?: string;
  nullable?: boolean;
  keys?: Array<"pk" | "fk" | "uq">;
  /** A foreign key's target as `table.column`. */
  references?: string;
}

/** An entity with structured rows (plan U11). Sized from its text by `core/shapes/entity-table/layout.ts`. */
export interface EntityTableShape extends BaseDrawingElement {
  type: "entity-table";
  kind?: "strong" | "weak" | "associative" | "junction";
  name?: string;
  rows?: EntityRow[];
}

export type UmlClassifierKind = "class" | "abstract" | "interface" | "enumeration" | "object" | "datatype" | "record" | "template";

/** A UML classifier (plan U12). Members are canonical text lines (`+pay(m: Method): Receipt`), parsed for drawing by `core/shapes/uml-classifier/members.ts`. */
export interface UmlClassifierShape extends BaseDrawingElement {
  type: "uml-classifier";
  kind?: UmlClassifierKind;
  name?: string;
  stereotype?: string;
  /** Template parameters, drawn in a dashed box at the corner. */
  template?: string;
  attributes?: string[];
  operations?: string[];
  collapsed?: { attributes?: boolean; operations?: boolean };
}

export type MindmapRole = "central" | "main" | "sub" | "leaf";

/** A mind-map topic (plan U14). Its branch to the parent is a connector (`ai.role: "branch"`), so collapse is the existing hide. */
export interface MindmapNodeShape extends BaseDrawingElement {
  type: "mindmap-node";
  role?: MindmapRole;
  parentId?: string;
  collapsed?: boolean;
  /** The colour a main branch gives its descendants. */
  branchColor?: string;
}

/** A participant with its lifeline (plan U17): a head, a dashed line down the body, and activation bars as fractions of the body. */
export interface LifelineShape extends BaseDrawingElement {
  type: "lifeline";
  name?: string;
  head?: "box" | "actor";
  activations?: Array<{ id: string; from: number; to: number }>;
}

/** Where a frame's title sits: in a band at the top of the frame, or on a tab above it. */
export type FrameTitlePlacement = "inside" | "above";

/** Named starting points for a frame; each only sets defaults (see `core/frames/presets.ts`). */
export type FramePreset =
  | "section"
  | "container"
  | "feature-group"
  | "swimlane"
  | "device"
  | "system-boundary"
  | "external-boundary"
  | "trust-boundary"
  | "network-boundary"
  | "cluster"
  | "layer"
  | "region"
  | "pool"
  | "lane"
  | "fragment";

/** A sequence-diagram fragment's operator, drawn in its tab. */
export type FragmentOperator = "loop" | "alt" | "opt" | "par" | "break" | "neg" | "critical";

/**
 * A frame: a titled region that owns the elements placed in it (see `core/frames`). `points` are the
 * two corners of its box, `color` is its border, `fill` its background (absent = transparent) and
 * `opacity` is how see-through its background and header band are (the border and title stay solid). Every other field is optional and an absent field means the
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
  /** `fragment` preset only: the operator written in the tab (loop, alt, opt, par, break). */
  operator?: FragmentOperator;
  /** `pool` and `lane` presets: the axis lanes stack along. Absent = horizontal bands (lanes stacked top to bottom). */
  orientation?: "horizontal" | "vertical";
  /** Fragment divider positions, as fractions of the height (an `else` or `and` section starts at each). */
  dividers?: number[];
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
  | OutlineShape
  | LineShape
  | TextShape
  | SemanticNodeShape
  | EntityTableShape
  | UmlClassifierShape
  | MindmapNodeShape
  | LifelineShape
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

/**
 * The layout configuration of one scope, stored in the same list as the shapes and group records (never
 * drawn, never selected, never exported). There is at most one per scope; see `core/layout/record.ts`.
 */
export interface LayoutRecord {
  /** `layout:<scope.kind>:<scope.id>` (`layout:board` for the whole board), so a scope has one record. */
  id: string;
  type: "layout";
  points: [];
  color: string;
  strokeWidth: number;
  /** A record is never grouped, locked, hidden or framed; these keep code that reads them off any stored item type-safe. */
  groupId?: undefined;
  locked?: undefined;
  hidden?: undefined;
  scope: { kind: "board" } | { kind: "diagram"; id: string } | { kind: "frame"; id: string };
  engine: string;
  algorithm: string;
  params?: Record<string, unknown>;
  /** What an edit that triggers layout may do: leave everything where it is, or adjust auto-placed elements. A full re-layout is never a stored default. */
  incremental: "preserve" | "adjust";
  version: 1;
}

/** Everything the stored list can hold. */
export type StoredElement = DrawingElement | GroupRecord | LayoutRecord;

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

import type { ConnectorRelation } from "@/features/whiteboard/types/whiteboard.types";

/**
 * The contract every layout engine implements. An engine places nodes and says what it did; it never writes the
 * document. A planner (`features/whiteboard/commands/layout-engine.ts`) turns a result into a `DocPatch`, so a
 * layout is one undo step, previewable, and the same code serves the editor, the code panel and the AI.
 */

export type EngineId = string;
export type DiagramFamily = "architecture" | "flowchart" | "er" | "uml" | "sequence" | "mind-map" | "general";

/** What a layout operation may do. See the amended plan, section 5.2. */
export type LayoutMode = "preserve" | "adjust" | "overwrite";

/** Who placed an element: `locked` and `user` are fixed for every automatic mode; only `overwrite` may move `user`; `locked` never moves. */
export type PositionSource = "auto" | "user" | "locked";

export interface Size {
  width: number;
  height: number;
}

/** A rectangle by its corners, in world units. */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LayoutNode extends Size {
  id: string;
  /** What the engine may read about the node: its words, kind and icon (so a recompile gives the same size), and its drawing. */
  label?: string;
  kind?: string;
  icon?: string;
  shape?: string;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  relation?: ConnectorRelation;
  /** Which end is the parent when the content says so (an ER table that holds the foreign key is the child). */
  parent?: "from" | "to";
}

export interface LayoutContainer {
  id: string;
  label?: string;
  kind: "group" | "frame" | "package" | "lane" | "pool" | "boundary";
  members: string[];
  locked?: boolean;
}

export interface LayoutGraph {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  containers: LayoutContainer[];
  /** The diagram's type, when it has one (`architecture`, `flowchart`, ...). */
  diagramType?: string;
  /** The direction the diagram was drawn in, as diagram code writes it (`right`, `up`, `left`); absent = top to bottom. */
  direction?: "right" | "up" | "left";
}

/** Where an existing node is, by its top-left corner, and who put it there. */
export interface PlacedNode {
  x: number;
  y: number;
  source: PositionSource;
}

export type LayoutConstraint =
  | { kind: "region"; rect: Rect }
  | { kind: "minGap"; gap: number }
  | { kind: "keepOrder"; axis: "x" | "y"; ids: string[] };

/** What changed since the last layout, when the caller knows (otherwise an adjust re-lays out every auto element). */
export interface GraphDelta {
  added: string[];
  removed: string[];
  changedEdges: string[];
  resized: string[];
}

export interface LayoutBudget {
  maxMs: number;
  /** The most an auto element may move in an incremental layout; beyond it the element is reported, not moved. */
  maxMoveOfAuto?: number;
}

export interface LayoutRequest<P = Record<string, unknown>> {
  graph: LayoutGraph;
  algorithm: string;
  params: P;
  mode: LayoutMode;
  /** Every node that already has a position. A node of the graph that is not here is new and unplaced. */
  positions: ReadonlyMap<string, PlacedNode>;
  constraints?: LayoutConstraint[];
  delta?: GraphDelta;
  seed: number;
  budget: LayoutBudget;
}

export interface LayoutDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  ids?: string[];
}

export interface LayoutStats {
  nodes: number;
  /** Placed by this result. */
  moved: number;
  /** Not moved because they are `user` or `locked` (the count an automatic layout held fixed). */
  heldFixed: number;
  maxDisplacement: number;
  meanDisplacement: number;
  /** Pairs of nodes whose x and y order the result keeps, as a share of all pairs (1 when nothing moved). */
  orderPreserved: number;
  overlaps: number;
}

export interface LayoutResult {
  /** Top-left corners of the nodes the engine placed. Fixed nodes are never in it (the kit removes them). */
  positions: Map<string, { x: number; y: number }>;
  /** Boxes the engine computed for containers, by container id. */
  containers?: Map<string, Rect>;
  /** Positions for annotation elements that follow the diagram (group frames, headings), keyed `<role>:<semanticId>`. */
  guides?: Map<string, Array<{ x: number; y: number }>>;
  moved: string[];
  unplaced: Array<{ id: string; reason: string }>;
  diagnostics: LayoutDiagnostic[];
}

export interface AlgorithmDef<P = Record<string, unknown>> {
  id: string;
  label: string;
  description: string;
  /** Defaults for the parameters the algorithm reads. */
  defaults: P;
  /** `native` runs in this repository's code; `elk` loads lazily and only when its gate says so. */
  backend: "native" | "elk";
}

export interface LayoutEngine<P = Record<string, unknown>> {
  id: EngineId;
  family: DiagramFamily;
  label: string;
  algorithms: readonly AlgorithmDef<P>[];
  /** What this engine cannot lay out in `graph`, said plainly (a mind map must be a tree). Empty when it can. */
  validate(graph: LayoutGraph): LayoutDiagnostic[];
  /** Initial layout: place every movable node. */
  layout(request: LayoutRequest<P>): LayoutResult;
  /** Incremental layout: place the delta, move auto elements minimally, never move fixed ones. */
  update(request: LayoutRequest<P>): LayoutResult;
}

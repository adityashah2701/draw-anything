/** What a layout engine receives and returns. All lengths are world units. */
export interface PlacementNode {
  id: string;
  width: number;
  height: number;
  /** Row index for layered layouts; edges normally point from smaller to larger depth. */
  depth: number;
  /** Outermost group the node belongs to; layered layout keeps cluster members side by side. */
  cluster?: string;
  /** Nested groups the node is in, outermost first (each strictly inside the previous). */
  clusterPath?: string[];
}

export interface PlacementEdge {
  from: string;
  to: string;
  /** Width of the edge's label, if it has one, so an engine can leave room for it. */
  labelWidth?: number;
  /** What the connection means, for engines that lay out by relation (inheritance above its subtypes). */
  relation?: import("@/features/whiteboard/types/whiteboard.types").ConnectorRelation;
}

export interface PlacementGroup {
  id: string;
  nodeIds: string[];
}

export interface PlacementInput {
  nodes: PlacementNode[];
  edges: PlacementEdge[];
  groups: PlacementGroup[];
  /**
   * `horizontal`/`vertical` already include `groupRoom` (space reserved so group frames fit between
   * nodes). An engine that pads groups itself should subtract it.
   */
  gaps: {
    horizontal: number;
    vertical: number;
    groupRoom: number;
    /** Gap to leave below the row at each depth where connectors need more than `vertical` (see `channels.ts`). */
    verticalByDepth?: ReadonlyMap<number, number>;
  };
}

/** Top-left corner of every node. Must be deterministic for identical input. */
export type Placement = Map<string, { x: number; y: number }>;

export type PlacementEngine = (input: PlacementInput) => Placement;

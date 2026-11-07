// Connection and relation types for connectors and anchors

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


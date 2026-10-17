import type { AIDiagramType } from "@/features/ai/types";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

export interface DiagramCodeIssue {
  /** 1-based line in the source. */
  line: number;
  severity: "error" | "warning";
  message: string;
}

export interface ParsedNode {
  /** Stable id derived from the name. */
  id: string;
  /** The name as written; this is what connections refer to. */
  name: string;
  /** Text shown on the canvas (the `label` property, else the name). */
  label: string;
  /** Raw `kind` value; normalised later against the known kinds. */
  kind?: string;
  /** Raw `icon` value; resolved against the icon registry later. */
  icon?: string;
  dashed?: boolean;
  /** `diamond` or `pill` (`oval`/`ellipse` read as pill); other Eraser shapes are reported and ignored. */
  shape?: "diamond" | "pill" | "icon";
  /** #rrggbb */
  color?: string;
  /** Top-left corner and size in canvas units; when given, the node is drawn exactly there. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** A side of a node a connection can leave or enter by. */
export type EdgeSide = "top" | "right" | "bottom" | "left";

export interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  bidirectional?: boolean;
  dashed?: boolean;
  /** `-` / `--`: a line with no arrowhead. */
  plain?: boolean;
  color?: string;
  /** Side of the source node the connection leaves by / side of the target it enters by. */
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  line: number;
}

export interface ParsedGroup {
  id: string;
  label: string;
  /** Every node inside the group, including those of nested groups. */
  nodeIds: string[];
  parentId?: string;
}

export interface ParsedDiagramCode {
  title?: string;
  diagramType?: AIDiagramType;
  direction?: "down" | "right";
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  groups: ParsedGroup[];
  issues: DiagramCodeIssue[];
}

/** What the editor hands to the canvas when code is applied. */
export interface ApplyDiagramCodePayload {
  elements: DrawingElement[];
  /** Existing elements to delete first (the diagram this code was loaded from). */
  replaceIds: string[];
  /**
   * The elements are already in their final world positions (some nodes were pinned where the user
   * put them), so the canvas must not shift them to line up with the diagram they replace.
   */
  anchored?: boolean;
}

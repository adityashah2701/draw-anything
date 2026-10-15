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
  /** Raw `kind`/`icon` value; normalised later against the known kinds. */
  kind?: string;
  dashed?: boolean;
}

export interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  bidirectional?: boolean;
  dashed?: boolean;
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

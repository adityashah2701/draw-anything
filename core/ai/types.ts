/**
 * core/ai/types.ts
 *
 * Canonical shared types for the agentic Groq layer.
 * These types represent the LOGICAL graph that the AI agent sees and mutates.
 * No geometry, coordinates, or visual attributes live here.
 */

// ─── Node ───────────────────────────────────────────────────────────────────

export type NodeShape = "rectangle" | "circle" | "diamond";

export type ArchitectureLayer =
  | "edge"
  | "application"
  | "data"
  | "observability";

export interface AgentNode {
  /** Stable logical ID chosen by the agent (e.g. "auth_service") */
  readonly id: string;
  readonly label: string;
  readonly shape: NodeShape;
  /** Only meaningful for architecture diagrams */
  readonly layer?: ArchitectureLayer;
  /** Column hint within the layer (0-indexed) */
  readonly column?: number;
  /**
   * Explicit fill (background) color override.
   * Accepts CSS color values: named ("green", "red"), hex ("#22c55e"), or any valid CSS color.
   * When set, overrides the automatic palette chosen by the layout engine.
   * Use sparingly — only when color is semantically meaningful (e.g. success=green, error=red).
   */
  readonly fill?: string;
  /**
   * Explicit text/stroke color override.
   * Defaults to near-black (#1f2937) when not set.
   */
  readonly color?: string;
}

// ─── Edge ───────────────────────────────────────────────────────────────────

export interface AgentEdge {
  /** Opaque UUID assigned by GraphStore on createEdge */
  readonly edgeId: string;
  readonly from: string;
  readonly to: string;
  readonly bidirectional?: boolean;
  readonly dashed?: boolean;
}

// ─── Graph ───────────────────────────────────────────────────────────────────

export interface AgentGraph {
  /** nodes keyed by node id */
  readonly nodes: Readonly<Record<string, AgentNode>>;
  /** edges keyed by edge id */
  readonly edges: Readonly<Record<string, AgentEdge>>;
  /** Monotonically increasing counter; changes on every mutation */
  readonly version: number;
}

// ─── Tool results ────────────────────────────────────────────────────────────

export interface ToolSuccess<T = Record<string, unknown>> {
  readonly ok: true;
  readonly data: T;
}

export interface ToolError {
  readonly ok: false;
  readonly error: string;
}

export type ToolCallResult<T = Record<string, unknown>> =
  | ToolSuccess<T>
  | ToolError;

// Specific result payloads

export interface CreateNodeResult {
  readonly nodeId: string;
}

export interface CreateEdgeResult {
  readonly edgeId: string;
}

export interface UpdateNodeResult {
  readonly nodeId: string;
  readonly patch: Partial<Omit<AgentNode, "id">>;
}

export interface DeleteNodeResult {
  readonly deletedNodeId: string;
  readonly deletedEdgeIds: string[];
}

export interface DeleteEdgeResult {
  readonly deletedEdgeId: string;
}

export interface MoveNodeResult {
  readonly nodeId: string;
  readonly layer: ArchitectureLayer;
}

// ─── Structural diff (sent per iteration instead of full graph) ───────────────

export interface GraphDiff {
  readonly added: {
    nodes: AgentNode[];
    edges: AgentEdge[];
  };
  readonly removed: {
    nodeIds: string[];
    edgeIds: string[];
  };
  readonly updated: AgentNode[];
}

// ─── Workflow output ─────────────────────────────────────────────────────────

export interface AgentWorkflowResult {
  readonly agentGraph: AgentGraph;
  readonly iterations: number;
  readonly timedOut: boolean;
}

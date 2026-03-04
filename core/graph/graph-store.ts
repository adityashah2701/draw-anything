/**
 * core/graph/graph-store.ts
 *
 * Copy-on-write immutable graph store.
 *
 * Design principles:
 * - Every mutation returns a NEW GraphStore instance.
 * - The previous instance is unmodified (immutable snapshots).
 * - Memory cost per op = O(1) — only the changed record is replaced.
 * - nodes and edges are plain frozen objects keyed by ID / edgeId.
 * - Pre-mutation validation is enforced here; invalid ops return an Error.
 */

import type {
  AgentEdge,
  AgentGraph,
  AgentNode,
  ArchitectureLayer,
} from "@/core/ai/types";

// ─── UUID helper (no external dep) ──────────────────────────────────────────

function generateEdgeId(): string {
  // crypto.randomUUID() is available in Node 18+ and all modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments that don't have Web Crypto
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export class GraphStore {
  readonly nodes: Readonly<Record<string, AgentNode>>;
  readonly edges: Readonly<Record<string, AgentEdge>>;
  readonly version: number;

  private constructor(
    nodes: Readonly<Record<string, AgentNode>>,
    edges: Readonly<Record<string, AgentEdge>>,
    version: number,
  ) {
    this.nodes = Object.freeze(nodes);
    this.edges = Object.freeze(edges);
    this.version = version;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static empty(): GraphStore {
    return new GraphStore({}, {}, 0);
  }

  static fromAgentGraph(graph: AgentGraph): GraphStore {
    return new GraphStore(graph.nodes, graph.edges, graph.version);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  hasNode(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.nodes, id);
  }

  hasEdge(edgeId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.edges, edgeId);
  }

  hasDuplicateEdge(from: string, to: string): boolean {
    for (const edge of Object.values(this.edges)) {
      if (edge.from === from && edge.to === to) return true;
    }
    return false;
  }

  nodeCount(): number {
    return Object.keys(this.nodes).length;
  }

  edgeCount(): number {
    return Object.keys(this.edges).length;
  }

  /** Returns edge IDs that reference a given node ID */
  incidentEdgeIds(nodeId: string): string[] {
    return Object.values(this.edges)
      .filter((e) => e.from === nodeId || e.to === nodeId)
      .map((e) => e.edgeId);
  }

  toAgentGraph(): AgentGraph {
    return {
      nodes: this.nodes,
      edges: this.edges,
      version: this.version,
    };
  }

  // ── Mutations (pre-validated, CoW) ─────────────────────────────────────────

  /**
   * Creates a new node.
   * Returns an Error if:
   *   - id already exists
   *   - label is empty
   *   - shape is not a valid enum value
   */
  createNode(node: AgentNode): GraphStore | Error {
    const validShapes = ["rectangle", "circle", "diamond"];

    if (!node.id || !node.id.trim()) {
      return new Error("createNode: id must be a non-empty string.");
    }
    if (!node.label || !node.label.trim()) {
      return new Error(`createNode: label must be non-empty (id=${node.id}).`);
    }
    if (!validShapes.includes(node.shape)) {
      return new Error(
        `createNode: invalid shape "${node.shape}". Must be rectangle, circle, or diamond.`,
      );
    }
    if (this.hasNode(node.id)) {
      return new Error(
        `createNode: a node with id "${node.id}" already exists.`,
      );
    }

    return new GraphStore(
      { ...this.nodes, [node.id]: Object.freeze(node) },
      this.edges,
      this.version + 1,
    );
  }

  /**
   * Updates an existing node with a partial patch.
   * Returns an Error if:
   *   - node id does not exist
   *   - patch is empty
   *   - patch contains invalid values (shapes, etc.)
   */
  updateNode(
    id: string,
    patch: Partial<Omit<AgentNode, "id">>,
  ): GraphStore | Error {
    if (!this.hasNode(id)) {
      return new Error(`updateNode: node "${id}" does not exist.`);
    }

    const patchKeys = Object.keys(patch).filter(
      (k) => patch[k as keyof typeof patch] !== undefined,
    );
    if (patchKeys.length === 0) {
      return new Error(`updateNode: patch for node "${id}" is empty.`);
    }

    if (patch.shape !== undefined) {
      const validShapes = ["rectangle", "circle", "diamond"];
      if (!validShapes.includes(patch.shape)) {
        return new Error(`updateNode: invalid shape "${patch.shape}".`);
      }
    }
    if (patch.label !== undefined && !patch.label.trim()) {
      return new Error(`updateNode: label must be non-empty.`);
    }

    const updated = Object.freeze({ ...this.nodes[id], ...patch });
    return new GraphStore(
      { ...this.nodes, [id]: updated },
      this.edges,
      this.version + 1,
    );
  }

  /**
   * Deletes a node and ALL its incident edges.
   * Returns an Error if the node does not exist.
   */
  deleteNode(
    id: string,
  ): { store: GraphStore; removedEdgeIds: string[] } | Error {
    if (!this.hasNode(id)) {
      return new Error(`deleteNode: node "${id}" does not exist.`);
    }

    const removedEdgeIds = this.incidentEdgeIds(id);
    const removedEdgeSet = new Set(removedEdgeIds);

    const newNodes = Object.fromEntries(
      Object.entries(this.nodes).filter(([nid]) => nid !== id),
    );
    const newEdges = Object.fromEntries(
      Object.entries(this.edges).filter(([eid]) => !removedEdgeSet.has(eid)),
    );

    return {
      store: new GraphStore(
        Object.freeze(newNodes),
        Object.freeze(newEdges),
        this.version + 1,
      ),
      removedEdgeIds,
    };
  }

  /**
   * Creates a directed edge between two existing nodes.
   * Returns an Error if:
   *   - either node does not exist
   *   - self-loop detected
   *   - duplicate from→to edge already exists
   */
  createEdge(
    from: string,
    to: string,
    attrs: { bidirectional?: boolean; dashed?: boolean } = {},
  ): { store: GraphStore; edgeId: string } | Error {
    if (!this.hasNode(from)) {
      return new Error(`createEdge: source node "${from}" does not exist.`);
    }
    if (!this.hasNode(to)) {
      return new Error(`createEdge: target node "${to}" does not exist.`);
    }
    if (from === to) {
      return new Error(
        `createEdge: self-loops are not allowed (node "${from}").`,
      );
    }
    if (this.hasDuplicateEdge(from, to)) {
      return new Error(
        `createEdge: an edge from "${from}" to "${to}" already exists.`,
      );
    }

    const edgeId = generateEdgeId();
    const edge: AgentEdge = Object.freeze({
      edgeId,
      from,
      to,
      bidirectional: attrs.bidirectional ?? false,
      dashed: attrs.dashed ?? false,
    });

    return {
      store: new GraphStore(
        this.nodes,
        { ...this.edges, [edgeId]: edge },
        this.version + 1,
      ),
      edgeId,
    };
  }

  /**
   * Deletes an edge by its opaque edgeId.
   * Returns an Error if the edge does not exist.
   */
  deleteEdge(edgeId: string): GraphStore | Error {
    if (!this.hasEdge(edgeId)) {
      return new Error(`deleteEdge: edge "${edgeId}" does not exist.`);
    }

    const newEdges = Object.fromEntries(
      Object.entries(this.edges).filter(([eid]) => eid !== edgeId),
    );
    return new GraphStore(
      this.nodes,
      Object.freeze(newEdges),
      this.version + 1,
    );
  }

  /**
   * Updates a node's layer assignment (architecture diagrams).
   * Returns an Error if node doesn't exist or layer is invalid.
   */
  moveNodeToCluster(id: string, layer: ArchitectureLayer): GraphStore | Error {
    const validLayers: ArchitectureLayer[] = [
      "edge",
      "application",
      "data",
      "observability",
    ];
    if (!validLayers.includes(layer)) {
      return new Error(
        `moveNodeToCluster: invalid layer "${layer}". Valid: ${validLayers.join(", ")}.`,
      );
    }
    return this.updateNode(id, { layer });
  }
}

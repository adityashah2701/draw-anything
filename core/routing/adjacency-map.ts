/**
 * adjacency-map.ts
 *
 * Directed adjacency map: nodeId → Set<edgeId>
 *
 * Enables O(degree) dirty-marking — when a node moves, only its connected
 * edges are marked dirty, rather than invalidating the entire graph.
 */

export class AdjacencyMap {
  private readonly map = new Map<string, Set<string>>();

  /**
   * Register an edge as connected to a node.
   */
  addEdge(nodeId: string, edgeId: string): void {
    let edges = this.map.get(nodeId);
    if (!edges) {
      edges = new Set<string>();
      this.map.set(nodeId, edges);
    }
    edges.add(edgeId);
  }

  /**
   * Remove an edge association from a node.
   */
  removeEdge(nodeId: string, edgeId: string): void {
    const edges = this.map.get(nodeId);
    if (edges) {
      edges.delete(edgeId);
      if (edges.size === 0) {
        this.map.delete(nodeId);
      }
    }
  }

  /**
   * Remove all edges associated with a node (e.g., when a node is deleted).
   */
  removeNode(nodeId: string): void {
    this.map.delete(nodeId);
  }

  /**
   * Remove a specific edgeId from ALL nodes (e.g., when an arrow is deleted).
   */
  removeEdgeFromAll(edgeId: string): void {
    for (const [nodeId, edges] of this.map.entries()) {
      edges.delete(edgeId);
      if (edges.size === 0) {
        this.map.delete(nodeId);
      }
    }
  }

  /**
   * Get all edge IDs connected to a node.
   * Returns an empty set if the node has no connections.
   */
  getEdgesForNode(nodeId: string): Set<string> {
    return this.map.get(nodeId) ?? new Set<string>();
  }

  /**
   * Check whether a node has any registered connections.
   */
  hasNode(nodeId: string): boolean {
    return this.map.has(nodeId);
  }

  /**
   * Rebuild the adjacency map from a list of edges.
   * Each edge must have { arrowId, sourceId?, targetId? }.
   */
  static fromEdges(
    edges: Array<{ arrowId: string; sourceId?: string; targetId?: string }>,
  ): AdjacencyMap {
    const adj = new AdjacencyMap();
    for (const edge of edges) {
      if (edge.sourceId) adj.addEdge(edge.sourceId, edge.arrowId);
      if (edge.targetId) adj.addEdge(edge.targetId, edge.arrowId);
    }
    return adj;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.map.clear();
  }
}

import { AIDiagramEdge, AIDiagramNode } from "@/features/ai/types";

export const analyzeGraph = (
  nodes: AIDiagramNode[],
  edges: AIDiagramEdge[],
) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  let invalidEdges = 0;

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      invalidEdges += 1;
      return;
    }
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  });

  const orphanNodeIds = nodes
    .filter((node) => (adjacency.get(node.id)?.size ?? 0) === 0)
    .map((node) => node.id);

  const components: string[][] = [];
  const visited = new Set<string>();
  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const component: string[] = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      adjacency.get(current)?.forEach((next) => {
        if (visited.has(next)) return;
        visited.add(next);
        queue.push(next);
      });
    }
    components.push(component);
  });

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    invalidEdges,
    orphanNodeIds,
    disconnectedComponents: components.length,
    components,
  };
};

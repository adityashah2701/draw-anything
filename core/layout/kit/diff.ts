import type { GraphDelta, LayoutEdge, LayoutGraph } from "../types";

const edgeKey = (edge: LayoutEdge) => `${edge.from}\u0000${edge.to}`;

/** What changed between two graphs, by stable id: the input of an incremental layout. */
export const diffGraphs = (previous: LayoutGraph, next: LayoutGraph): GraphDelta => {
  const before = new Map(previous.nodes.map((n) => [n.id, n]));
  const after = new Map(next.nodes.map((n) => [n.id, n]));
  const edgesBefore = new Map(previous.edges.map((e) => [edgeKey(e), e]));
  const edgesAfter = new Map(next.edges.map((e) => [edgeKey(e), e]));
  const changed = new Set<string>();
  for (const [key, edge] of edgesAfter) if (!edgesBefore.has(key)) changed.add(edge.id);
  for (const [key, edge] of edgesBefore) if (!edgesAfter.has(key)) changed.add(edge.id);
  return {
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    changedEdges: [...changed],
    resized: [...after.entries()].filter(([id, n]) => before.has(id) && (before.get(id)!.width !== n.width || before.get(id)!.height !== n.height)).map(([id]) => id),
  };
};

/**
 * The nodes an incremental layout may touch: the added, the resized, the endpoints of changed edges and the
 * endpoints of edges to removed nodes, plus the one-hop neighbours of each. Restricting to movable nodes is the caller's job.
 */
export const affectedSet = (delta: GraphDelta, graph: LayoutGraph, previous?: LayoutGraph): Set<string> => {
  const live = new Set(graph.nodes.map((n) => n.id));
  const seeds = new Set<string>([...delta.added, ...delta.resized]);
  const edges = [...graph.edges, ...(previous?.edges ?? [])];
  const byId = new Map(edges.map((e) => [e.id, e]));
  for (const id of delta.changedEdges) {
    const edge = byId.get(id);
    if (edge) {
      seeds.add(edge.from);
      seeds.add(edge.to);
    }
  }
  for (const edge of previous?.edges ?? []) if (delta.removed.includes(edge.from)) seeds.add(edge.to);
  else if (delta.removed.includes(edge.to)) seeds.add(edge.from);
  const out = new Set<string>();
  for (const id of seeds) if (live.has(id)) out.add(id);
  for (const edge of graph.edges) {
    if (seeds.has(edge.from) && live.has(edge.to)) out.add(edge.to);
    if (seeds.has(edge.to) && live.has(edge.from)) out.add(edge.from);
  }
  return out;
};

import { boundsOfPositions, componentsOf, packBoxes, relax, subgraph } from "../../kit/graph";
import { layeredNatural } from "../../kit/layered";
import { defineNaturalEngine } from "../../kit/natural";
import type { LayoutGraph } from "../../types";

type P = { gap: number };

const MANY = new Set(["many", "zero-or-many", "one-or-many"]);
const ONE = new Set(["one", "exactly-one", "zero-or-one"]);

/**
 * Parents above children whichever way the relationship was written: an edge whose start says "many" and whose
 * end says "one" is turned around for placement (the drawing keeps its own direction). Without this a diagram
 * that mixes `Loans > Members` with `Members > Reservations` stacks into a deep, tangled chain.
 */
const parentsFirst = (graph: LayoutGraph): LayoutGraph => ({
  ...graph,
  edges: graph.edges.map((e) => {
    if (e.parent) return e.parent === "to" ? { ...e, from: e.to, to: e.from } : e;
    const start = e.relation?.start?.cardinality;
    const end = e.relation?.end?.cardinality;
    return start && end && MANY.has(start) && ONE.has(end) ? { ...e, from: e.to, to: e.from } : e;
  }),
});

const layered = (graph: LayoutGraph, gap: number) => layeredNatural(graph, { direction: "down", gapInLayer: gap, gapBetweenLayers: gap + 40 });

/** One block per connected cluster of entities, each laid out layered, the blocks packed. */
const clusters = (graph: LayoutGraph, gap: number) => {
  const blocks = componentsOf(graph).map((ids, i) => {
    const sub = subgraph(graph, new Set(ids));
    const at = layered(sub, gap);
    return { key: `c${i}`, at, box: boundsOfPositions(at, graph) };
  });
  const packed = packBoxes(blocks.map((b) => ({ id: b.key, width: b.box.width, height: b.box.height })), gap * 2);
  const out = new Map<string, { x: number; y: number }>();
  for (const b of blocks) {
    const o = packed.get(b.key)!;
    for (const [id, p] of b.at) out.set(id, { x: p.x - b.box.minX + o.x, y: p.y - b.box.minY + o.y });
  }
  return out;
};

/** Entity-relationship diagrams: compact (force-directed with sizes), hierarchical (layered) or clustered. */
export const erEngine = defineNaturalEngine<P>({
  id: "er",
  family: "er",
  label: "Entity-relationship",
  algorithms: [
    { id: "clusters", label: "Relationship clusters", description: "Entities that are related stay together; clusters are packed.", defaults: { gap: 70 }, backend: "native" },
    { id: "compact", label: "Compact", description: "Related entities close together, using little space.", defaults: { gap: 70 }, backend: "native" },
    { id: "hierarchical", label: "Hierarchical", description: "Entities in rows by relationship.", defaults: { gap: 70 }, backend: "native" },
  ],
  natural: {
    clusters: (graph, p) => clusters(parentsFirst(graph), p.gap),
    hierarchical: (graph, p) => layered(parentsFirst(graph), p.gap),
    compact: (graph, p, seed) => {
      const start = clusters(parentsFirst(graph), p.gap);
      return relax(graph, start, { iterations: 80, ideal: Math.max(...graph.nodes.map((n) => Math.hypot(n.width, n.height)), 120) + p.gap, seed });
    },
  },
});

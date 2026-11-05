import { boundsOfPositions, packBoxes, subgraph } from "../../kit/graph";
import { layeredNatural } from "../../kit/layered";
import { defineNaturalEngine } from "../../kit/natural";
import type { LayoutEdge, LayoutGraph } from "../../types";

type P = { gap: number };

const isInheritance = (e: LayoutEdge) => e.relation?.kind === "generalization" || e.relation?.kind === "realization";
const base = (graph: LayoutGraph, gap: number, reverse: boolean, only?: ReadonlySet<string>) =>
  layeredNatural(graph, { direction: "down", gapInLayer: gap, gapBetweenLayers: gap + 40, reverse: reverse ? isInheritance : undefined, only });

/**
 * UML: `inheritance` puts a supertype above its subtypes (generalisation and realisation edges are drawn child to
 * parent, so they are flipped for layering); `layered` follows every edge as drawn; `package` lays each package
 * out on its own and arranges the packages as blocks.
 */
export const umlEngine = defineNaturalEngine<P>({
  id: "uml",
  family: "uml",
  label: "UML",
  algorithms: [
    { id: "inheritance", label: "Inheritance hierarchy", description: "Supertypes above subtypes; other relations run sideways.", defaults: { gap: 60 }, backend: "native" },
    { id: "layered", label: "Layered", description: "Every connection runs from a higher row to a lower one, as drawn.", defaults: { gap: 60 }, backend: "native" },
    { id: "package", label: "By package", description: "Each package is laid out on its own, then the packages are arranged.", defaults: { gap: 60 }, backend: "native" },
  ],
  natural: {
    inheritance: (graph, p) => base(graph, p.gap, true),
    layered: (graph, p) => base(graph, p.gap, false),
    package: (graph, p) => {
      const groups = graph.containers.map((c) => ({ id: c.id, ids: new Set(c.members.filter((m) => graph.nodes.some((n) => n.id === m))) }));
      const claimed = new Set(groups.flatMap((g) => [...g.ids]));
      const loose = new Set(graph.nodes.filter((n) => !claimed.has(n.id)).map((n) => n.id));
      const blocks = [...groups.map((g) => g.ids), ...(loose.size > 0 ? [loose] : [])].filter((s) => s.size > 0);
      const laid = blocks.map((ids, i) => {
        const sub = subgraph(graph, ids);
        const at = layeredNatural(sub, { direction: "down", gapInLayer: p.gap, gapBetweenLayers: p.gap + 40, reverse: isInheritance });
        return { key: `b${i}`, at, box: boundsOfPositions(at, graph) };
      });
      const packed = packBoxes(laid.map((b) => ({ id: b.key, width: b.box.width, height: b.box.height })), p.gap * 2);
      const out = new Map<string, { x: number; y: number }>();
      for (const b of laid) {
        const o = packed.get(b.key)!;
        for (const [id, pos] of b.at) out.set(id, { x: pos.x - b.box.minX + o.x, y: pos.y - b.box.minY + o.y });
      }
      return out;
    },
  },
});

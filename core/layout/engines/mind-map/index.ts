import { relax, seeded } from "../../kit/graph";
import { defineNaturalEngine } from "../../kit/natural";
import type { LayoutGraph, LayoutNode } from "../../types";

type P = { gap: number; sides: "both" | "right" };

interface Tree {
  root: string;
  children: Map<string, string[]>;
  depth: Map<string, number>;
  leaves: Map<string, number>;
  /** Nodes not reachable from the root (another component): laid out below. */
  rest: string[];
}

/** The root is the node nothing points to that has the most connections; a tree is read from it breadth first. Cycles are ignored. */
const readTree = (graph: LayoutGraph): Tree => {
  const incoming = new Set(graph.edges.map((e) => e.to));
  const degree = new Map(graph.nodes.map((n) => [n.id, 0]));
  graph.edges.forEach((e) => { degree.set(e.from, (degree.get(e.from) ?? 0) + 1); degree.set(e.to, (degree.get(e.to) ?? 0) + 1); });
  const candidates = graph.nodes.filter((n) => !incoming.has(n.id));
  const root = [...(candidates.length > 0 ? candidates : graph.nodes)].sort((a, b) => (degree.get(b.id)! - degree.get(a.id)!))[0]?.id ?? "";
  const children = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  const depth = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of graph.edges) {
      const other = e.from === id ? e.to : e.to === id ? e.from : undefined;
      if (other && !depth.has(other)) {
        depth.set(other, depth.get(id)! + 1);
        children.get(id)!.push(other);
        queue.push(other);
      }
    }
  }
  const leaves = new Map<string, number>();
  const count = (id: string): number => {
    const kids = children.get(id) ?? [];
    const n = kids.length === 0 ? 1 : kids.reduce((s, k) => s + count(k), 0);
    leaves.set(id, n);
    return n;
  };
  if (root) count(root);
  return { root, children, depth, leaves, rest: graph.nodes.filter((n) => !depth.has(n.id)).map((n) => n.id) };
};

const byId = (graph: LayoutGraph) => new Map(graph.nodes.map((n) => [n.id, n]));
const place = (centres: Map<string, { x: number; y: number }>, nodes: Map<string, LayoutNode>) => {
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, c] of centres) out.set(id, { x: c.x - nodes.get(id)!.width / 2, y: c.y - nodes.get(id)!.height / 2 });
  return out;
};
const normalize = (m: Map<string, { x: number; y: number }>) => {
  const minX = Math.min(...[...m.values()].map((p) => p.x), 0), minY = Math.min(...[...m.values()].map((p) => p.y), 0);
  return new Map([...m].map(([id, p]) => [id, { x: p.x - minX, y: p.y - minY }]));
};
/** Nodes the tree does not reach go in a row below it, so nothing is left unplaced. */
const addRest = (graph: LayoutGraph, tree: Tree, out: Map<string, { x: number; y: number }>, gap: number) => {
  const nodes = byId(graph);
  const below = Math.max(...[...out].map(([id, p]) => p.y + nodes.get(id)!.height), 0) + gap * 2;
  let x = 0;
  for (const id of tree.rest) {
    out.set(id, { x, y: below });
    x += nodes.get(id)!.width + gap;
  }
  return out;
};

const radial = (graph: LayoutGraph, p: P): Map<string, { x: number; y: number }> => {
  const tree = readTree(graph);
  const nodes = byId(graph);
  const ring = Math.max(...graph.nodes.map((n) => Math.hypot(n.width, n.height)), 100) + p.gap;
  const centres = new Map<string, { x: number; y: number }>();
  const lay = (id: string, from: number, to: number) => {
    const d = tree.depth.get(id)!;
    const mid = (from + to) / 2;
    centres.set(id, d === 0 ? { x: 0, y: 0 } : { x: Math.cos(mid) * ring * d, y: Math.sin(mid) * ring * d });
    const kids = tree.children.get(id) ?? [];
    const total = kids.reduce((s, k) => s + tree.leaves.get(k)!, 0) || 1;
    let a = from;
    for (const k of kids) {
      const span = ((to - from) * tree.leaves.get(k)!) / total;
      lay(k, a, a + span);
      a += span;
    }
  };
  if (tree.root) lay(tree.root, -Math.PI / 2, (3 * Math.PI) / 2);
  return addRest(graph, tree, normalize(place(centres, nodes)), p.gap);
};

const treeLayout = (graph: LayoutGraph, p: P): Map<string, { x: number; y: number }> => {
  const tree = readTree(graph);
  const nodes = byId(graph);
  const colWidth = Math.max(...graph.nodes.map((n) => n.width), 100) + p.gap * 1.5;
  const rowHeight = Math.max(...graph.nodes.map((n) => n.height), 40) + p.gap * 0.6;
  const centres = new Map<string, { x: number; y: number }>();
  let cursor = 0;
  const lay = (id: string, dir: 1 | -1): number => {
    const d = tree.depth.get(id)!;
    const kids = tree.children.get(id) ?? [];
    const ys = kids.length === 0 ? [cursor++ * rowHeight] : kids.map((k) => lay(k, dir));
    const y = kids.length === 0 ? ys[0] : (Math.min(...ys) + Math.max(...ys)) / 2;
    centres.set(id, { x: dir * d * colWidth, y });
    return y;
  };
  if (tree.root) {
    const kids = tree.children.get(tree.root) ?? [];
    if (p.sides === "both" && kids.length > 1) {
      // Alternate the root's branches between the two sides, each side balanced on its own.
      const right = kids.filter((_, i) => i % 2 === 0), left = kids.filter((_, i) => i % 2 === 1);
      const ysR = right.map((k) => lay(k, 1));
      cursor = 0;
      const ysL = left.map((k) => lay(k, -1));
      const all = [...ysR, ...ysL];
      centres.set(tree.root, { x: 0, y: (Math.min(...all) + Math.max(...all)) / 2 });
    } else lay(tree.root, 1);
  }
  return addRest(graph, tree, normalize(place(centres, nodes)), p.gap);
};

/** Mind maps: radial (branches fan out by weight), tree (left and right) and organic (relaxed from radial). */
export const mindMapEngine = defineNaturalEngine<P>({
  id: "mind-map",
  family: "mind-map",
  label: "Mind map",
  algorithms: [
    { id: "radial", label: "Radial", description: "The centre idea in the middle, branches fanned out around it.", defaults: { gap: 60, sides: "both" }, backend: "native" },
    { id: "tree", label: "Tree", description: "Branches to the left and right of the centre idea.", defaults: { gap: 60, sides: "both" }, backend: "native" },
    { id: "organic", label: "Organic", description: "A relaxed, hand-drawn feel: branches spread with room around each topic.", defaults: { gap: 60, sides: "both" }, backend: "native" },
  ],
  validate: (graph) => {
    const tree = readTree(graph);
    return tree.rest.length > 0 ? [{ severity: "warning", code: "mind-map/not-a-tree", message: `${tree.rest.length} topic(s) are not connected to the centre idea; they were put below.`, ids: tree.rest }] : [];
  },
  natural: {
    radial,
    tree: treeLayout,
    organic: (graph, p, seed) => {
      void seeded;
      const start = radial(graph, p);
      return normalize(relax(graph, start, { iterations: 60, ideal: Math.max(...graph.nodes.map((n) => Math.hypot(n.width, n.height)), 100) + p.gap, seed }));
    },
  },
});

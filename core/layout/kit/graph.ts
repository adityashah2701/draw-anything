import type { LayoutGraph, Size } from "../types";

/** Deterministic pseudo-random numbers (mulberry32), so an organic layout is the same every time for the same seed. */
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Connected components (edges taken as undirected), each in graph order, largest first. */
export const componentsOf = (graph: LayoutGraph): string[][] => {
  const parent = new Map(graph.nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  for (const e of graph.edges) if (parent.has(e.from) && parent.has(e.to)) parent.set(find(e.from), find(e.to));
  const byRoot = new Map<string, string[]>();
  for (const n of graph.nodes) byRoot.set(find(n.id), [...(byRoot.get(find(n.id)) ?? []), n.id]);
  const first = new Map(graph.nodes.map((n, i) => [n.id, i]));
  return [...byRoot.values()].sort((a, b) => b.length - a.length || first.get(a[0])! - first.get(b[0])!);
};

export interface Box extends Size {
  id: string;
}

/** Rows of boxes packed left to right, wrapping near `targetWidth`; returns each box's top-left. */
export const packBoxes = (boxes: readonly Box[], gap: number, targetWidth?: number): Map<string, { x: number; y: number }> => {
  const total = boxes.reduce((s, b) => s + b.width + gap, 0);
  const limit = targetWidth ?? Math.max(...boxes.map((b) => b.width), Math.sqrt(total * Math.max(...boxes.map((b) => b.height), 1)) * 1.6);
  const out = new Map<string, { x: number; y: number }>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const b of boxes) {
    if (x > 0 && x + b.width > limit) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    out.set(b.id, { x, y });
    x += b.width + gap;
    rowHeight = Math.max(rowHeight, b.height);
  }
  return out;
};

/** The box around a set of positioned nodes. */
export const boundsOfPositions = (positions: ReadonlyMap<string, { x: number; y: number }>, graph: LayoutGraph): Size & { minX: number; minY: number } => {
  const size = new Map(graph.nodes.map((n) => [n.id, n]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [id, p] of positions) {
    const s = size.get(id);
    if (!s) continue;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.width); maxY = Math.max(maxY, p.y + s.height);
  }
  return Number.isFinite(minX) ? { minX, minY, width: maxX - minX, height: maxY - minY } : { minX: 0, minY: 0, width: 0, height: 0 };
};

/** A graph restricted to some nodes (edges between them kept). */
export const subgraph = (graph: LayoutGraph, ids: ReadonlySet<string>): LayoutGraph => ({
  ...graph,
  nodes: graph.nodes.filter((n) => ids.has(n.id)),
  edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  containers: [],
});

/** Force-directed relaxation with node sizes: springs along edges, repulsion between all pairs. Deterministic for a seed. */
export const relax = (
  graph: LayoutGraph,
  start: ReadonlyMap<string, { x: number; y: number }>,
  { iterations = 120, ideal = 220, seed = 1 }: { iterations?: number; ideal?: number; seed?: number } = {},
): Map<string, { x: number; y: number }> => {
  const rnd = seeded(seed);
  const c = new Map<string, { x: number; y: number }>();
  for (const n of graph.nodes) {
    const s = start.get(n.id) ?? { x: 0, y: 0 };
    c.set(n.id, { x: s.x + n.width / 2 + (rnd() - 0.5) * 0.01, y: s.y + n.height / 2 + (rnd() - 0.5) * 0.01 });
  }
  const size = new Map(graph.nodes.map((n) => [n.id, n]));
  for (let it = 0; it < iterations; it += 1) {
    const cool = 1 - it / iterations;
    const force = new Map(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < graph.nodes.length; i += 1) {
      for (let j = i + 1; j < graph.nodes.length; j += 1) {
        const a = graph.nodes[i], b = graph.nodes[j];
        const pa = c.get(a.id)!, pb = c.get(b.id)!;
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const reach = (Math.hypot(a.width, a.height) + Math.hypot(b.width, b.height)) / 2 + 40;
        const push = d < reach * 2 ? ((reach * 2 - d) * 0.5) : 0;
        dx /= d; dy /= d;
        force.get(a.id)!.x += dx * push; force.get(a.id)!.y += dy * push;
        force.get(b.id)!.x -= dx * push; force.get(b.id)!.y -= dy * push;
      }
    }
    for (const e of graph.edges) {
      const pa = c.get(e.from), pb = c.get(e.to);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - ideal) * 0.1;
      force.get(e.from)!.x += (dx / d) * pull; force.get(e.from)!.y += (dy / d) * pull;
      force.get(e.to)!.x -= (dx / d) * pull; force.get(e.to)!.y -= (dy / d) * pull;
    }
    for (const n of graph.nodes) {
      const f = force.get(n.id)!, p = c.get(n.id)!;
      p.x += Math.max(-60, Math.min(60, f.x)) * cool;
      p.y += Math.max(-60, Math.min(60, f.y)) * cool;
    }
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, p] of c) out.set(id, { x: p.x - size.get(id)!.width / 2, y: p.y - size.get(id)!.height / 2 });
  return out;
};

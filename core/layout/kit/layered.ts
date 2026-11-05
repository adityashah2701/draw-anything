import { assignCenters, orderRows } from "./layered-order";
import type { LayoutGraph } from "../types";

export interface LayeredOptions {
  /** Layers run downwards (`down`) or to the right (`right`). */
  direction: "down" | "right";
  /** Space between nodes in a layer and between layers. */
  gapInLayer: number;
  gapBetweenLayers: number;
  /** Edges to flip before layering (an inheritance edge points child to parent, but the parent sits first). */
  reverse?: (edge: LayoutGraph["edges"][number]) => boolean;
  /** Edges that take part in layering and ordering; the rest are ignored (they are still drawn by the router). */
  use?: (edge: LayoutGraph["edges"][number]) => boolean;
  /** Which node ids to lay out (default every node). */
  only?: ReadonlySet<string>;
  /** Nodes kept next to each other in a layer (a package, a lane). */
  clusterOf?: (id: string) => string | undefined;
}

/** Layer index of each node: the longest path from a source, with cycles broken by dropping the edge that closes one. */
export const longestPathLayers = (ids: readonly string[], edges: ReadonlyArray<{ from: string; to: string }>): Map<string, number> => {
  const live = new Set(ids);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) if (live.has(e.from) && live.has(e.to) && e.from !== e.to) out.get(e.from)!.push(e.to);
  // Depth-first from each node in order; an edge to a node on the current path closes a cycle and is skipped.
  const state = new Map<string, 0 | 1 | 2>();
  const keep: Array<[string, string]> = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id)!) {
      if (state.get(to) === 1) continue;
      keep.push([id, to]);
      if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [from, to] of keep) incoming.get(to)!.push(from);
  const layer = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = incoming.get(id)!.reduce((m, from) => Math.max(m, depth(from, seen) + 1), 0);
    layer.set(id, d);
    return d;
  };
  for (const id of ids) depth(id);
  return layer;
};

/** A layered layout of `graph` (rows by layer, barycentre ordering, even spacing): top-left corners, the diagram's top-left at the origin. */
export const layeredNatural = (graph: LayoutGraph, options: LayeredOptions): Map<string, { x: number; y: number }> => {
  const nodes = graph.nodes.filter((n) => !options.only || options.only.has(n.id));
  const ids = nodes.map((n) => n.id);
  const edges = graph.edges.filter((e) => (options.use ? options.use(e) : true)).map((e) => (options.reverse?.(e) ? { ...e, from: e.to, to: e.from } : e));
  const layer = longestPathLayers(ids, edges);
  const down = options.direction === "down";
  // For a diagram that runs to the right the algorithm works on transposed sizes and the result is transposed back.
  const dims = new Map(nodes.map((n) => [n.id, down ? { w: n.width, h: n.height } : { w: n.height, h: n.width }]));
  // Members of one container stay together in a row, so a frame drawn around them holds only them.
  const container = new Map<string, string>();
  graph.containers.forEach((c) => c.members.forEach((m) => !container.has(m) && container.set(m, c.id)));
  const layoutNodes = nodes.map((n) => ({ id: n.id, depth: layer.get(n.id) ?? 0, width: dims.get(n.id)!.w, cluster: options.clusterOf?.(n.id) ?? container.get(n.id) }));
  const layoutEdges = edges.filter((e) => layer.has(e.from) && layer.has(e.to)).map((e) => ({ from: e.from, to: e.to }));
  const rows = orderRows(layoutNodes, layoutEdges);
  const centers = assignCenters(rows, layoutNodes, layoutEdges, { gap: options.gapInLayer, centerX: 0 });

  const out = new Map<string, { x: number; y: number }>();
  let top = 0;
  const depths = [...rows.keys()].sort((a, b) => a - b);
  for (const depth of depths) {
    const row = rows.get(depth)!;
    const rowHeight = Math.max(...row.map((id) => dims.get(id)!.h));
    for (const id of row) {
      const { w, h } = dims.get(id)!;
      const across = (centers.get(id) ?? 0) - w / 2;
      const along = top + (rowHeight - h) / 2;
      out.set(id, down ? { x: across, y: along } : { x: along, y: across });
    }
    top += rowHeight + options.gapBetweenLayers;
  }
  const minX = Math.min(...[...out.values()].map((p) => p.x), 0);
  const minY = Math.min(...[...out.values()].map((p) => p.y), 0);
  for (const [id, p] of out) out.set(id, { x: p.x - minX, y: p.y - minY });
  return out;
};

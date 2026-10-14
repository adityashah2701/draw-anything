/**
 * Ordering and horizontal placement for a layered diagram.
 *
 * The compiler already knows each node's row (depth). What decides whether the
 * result is readable is the *order within rows* (edge crossings) and how far
 * connected nodes sit from each other. Rows used to be sorted alphabetically,
 * which ignores both.
 */

export interface LayoutNode {
  id: string;
  /** Row index; edges normally point from smaller to larger depth. */
  depth: number;
  width: number;
  /**
   * Nodes sharing a cluster (a group) are kept next to each other within a row
   * so that a frame drawn around them does not swallow unrelated nodes.
   */
  cluster?: string;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

type Rows = Map<number, string[]>;

const clone = (rows: Rows): Rows =>
  new Map([...rows.entries()].map(([depth, ids]) => [depth, [...ids]]));

const signature = (rows: Rows) =>
  [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, ids]) => `${depth}:${ids.join(",")}`)
    .join("|");

const normalizedPositions = (rows: Rows) => {
  const positions = new Map<string, number>();
  rows.forEach((ids) => ids.forEach((id, index) => positions.set(id, (index + 0.5) / ids.length)));
  return positions;
};

const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

/**
 * Number of pairs of edges that cross when every node is drawn at its
 * normalized position in its row. Same-row edges, edges to unknown nodes and
 * edges sharing an endpoint are not counted.
 */
export const countCrossings = (
  rows: Rows,
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): number => {
  const depthOf = new Map(nodes.map((node) => [node.id, node.depth]));
  const positions = normalizedPositions(rows);
  const segments: Array<{ a: string; b: string; x1: number; y1: number; x2: number; y2: number }> = [];

  for (const edge of edges) {
    const d1 = depthOf.get(edge.from);
    const d2 = depthOf.get(edge.to);
    const x1 = positions.get(edge.from);
    const x2 = positions.get(edge.to);
    if (d1 === undefined || d2 === undefined || d1 === d2 || x1 === undefined || x2 === undefined) {
      continue;
    }
    segments.push({ a: edge.from, b: edge.to, x1, y1: d1, x2, y2: d2 });
  }

  let crossings = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const s = segments[i];
      const t = segments[j];
      if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
      const o1 = orientation(s.x1, s.y1, s.x2, s.y2, t.x1, t.y1);
      const o2 = orientation(s.x1, s.y1, s.x2, s.y2, t.x2, t.y2);
      const o3 = orientation(t.x1, t.y1, t.x2, t.y2, s.x1, s.y1);
      const o4 = orientation(t.x1, t.y1, t.x2, t.y2, s.x2, s.y2);
      if (o1 * o2 < 0 && o3 * o4 < 0) crossings += 1;
    }
  }
  return crossings;
};

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Keep members of one cluster adjacent, ordered by where the cluster first appears. */
const clusterContiguous = (ids: string[], clusterOf: Map<string, string>): string[] => {
  const order: string[] = [];
  const members = new Map<string, string[]>();
  for (const id of ids) {
    const key = clusterOf.get(id) ?? id;
    if (!members.has(key)) {
      members.set(key, []);
      order.push(key);
    }
    members.get(key)!.push(id);
  }
  return order.flatMap((key) => members.get(key)!);
};

/**
 * Order the nodes of every row to reduce edge crossings (barycenter sweeps,
 * down then up). The best order seen is returned, so the result is never worse
 * than the input order, and it is deterministic.
 */
export const orderRows = (
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  { maxSweeps = 8 }: { maxSweeps?: number } = {},
): Rows => {
  const depthOf = new Map(nodes.map((node) => [node.id, node.depth]));
  const clusterOf = new Map<string, string>();
  nodes.forEach((node) => node.cluster && clusterOf.set(node.id, node.cluster));

  const rows: Rows = new Map();
  for (const node of nodes) {
    if (!rows.has(node.depth)) rows.set(node.depth, []);
    rows.get(node.depth)!.push(node.id);
  }
  rows.forEach((ids, depth) => rows.set(depth, clusterContiguous(ids, clusterOf)));

  const above = new Map<string, string[]>();
  const below = new Map<string, string[]>();
  for (const edge of edges) {
    const d1 = depthOf.get(edge.from);
    const d2 = depthOf.get(edge.to);
    if (d1 === undefined || d2 === undefined || d1 === d2) continue;
    const [upper, lower] = d1 < d2 ? [edge.from, edge.to] : [edge.to, edge.from];
    below.set(upper, [...(below.get(upper) ?? []), lower]);
    above.set(lower, [...(above.get(lower) ?? []), upper]);
  }

  const reorder = (depth: number, neighbours: Map<string, string[]>) => {
    const ids = rows.get(depth);
    if (!ids || ids.length < 2) return;
    const positions = normalizedPositions(rows);
    const barycenter = new Map<string, number>();
    ids.forEach((id, index) => {
      const near = (neighbours.get(id) ?? [])
        .map((other) => positions.get(other))
        .filter((p): p is number => p !== undefined);
      barycenter.set(id, near.length > 0 ? mean(near) : (index + 0.5) / ids.length);
    });

    const index = new Map(ids.map((id, i) => [id, i]));
    const units = new Map<string, string[]>();
    for (const id of ids) {
      const key = clusterOf.get(id) ?? id;
      units.set(key, [...(units.get(key) ?? []), id]);
    }
    const byBarycenter = (a: string, b: string) =>
      (barycenter.get(a)! - barycenter.get(b)!) || (index.get(a)! - index.get(b)!);

    const ordered = [...units.values()]
      .map((members) => ({
        members: [...members].sort(byBarycenter),
        score: mean(members.map((id) => barycenter.get(id)!)),
        first: Math.min(...members.map((id) => index.get(id)!)),
      }))
      .sort((a, b) => (a.score - b.score) || (a.first - b.first))
      .flatMap((unit) => unit.members);
    rows.set(depth, ordered);
  };

  const depths = [...rows.keys()].sort((a, b) => a - b);
  let best = clone(rows);
  let bestScore = countCrossings(rows, nodes, edges);
  let lastSignature = signature(rows);

  for (let sweep = 0; sweep < maxSweeps && bestScore > 0; sweep += 1) {
    for (const depth of depths) reorder(depth, above);
    for (const depth of [...depths].reverse()) reorder(depth, below);
    const score = countCrossings(rows, nodes, edges);
    if (score < bestScore) {
      best = clone(rows);
      bestScore = score;
    }
    const current = signature(rows);
    if (current === lastSignature) break; // converged
    lastSignature = current;
  }
  return best;
};

/**
 * Place `desired` centers as close as possible (least squares) while keeping
 * neighbours at least `width/2 + gap + width/2` apart and in the same order.
 * Solved exactly with pool-adjacent-violators.
 */
const placeRow = (desired: number[], widths: number[], gap: number): number[] => {
  const offset: number[] = [0];
  for (let i = 1; i < desired.length; i += 1) {
    offset[i] = offset[i - 1] + (widths[i - 1] + widths[i]) / 2 + gap;
  }
  const blocks: Array<{ sum: number; count: number }> = [];
  desired.forEach((d, i) => {
    blocks.push({ sum: d - offset[i], count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (prev.sum / prev.count <= last.sum / last.count) break;
      blocks.splice(-2, 2, { sum: prev.sum + last.sum, count: prev.count + last.count });
    }
  });
  const fitted: number[] = [];
  blocks.forEach((block) => {
    for (let k = 0; k < block.count; k += 1) fitted.push(block.sum / block.count);
  });
  return fitted.map((value, i) => value + offset[i]);
};

/**
 * Horizontal center of every node. Rows start centered; then each row is
 * pulled toward the mean center of its neighbours (down, then up, a few times)
 * without ever overlapping or reordering, so parents sit above their children
 * and long diagonal edges become rare.
 */
export const assignCenters = (
  rows: Rows,
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  { gap, centerX, sweeps = 4 }: { gap: number; centerX: number; sweeps?: number },
): Map<string, number> => {
  const width = new Map(nodes.map((node) => [node.id, node.width]));
  const depthOf = new Map(nodes.map((node) => [node.id, node.depth]));
  const center = new Map<string, number>();

  const depths = [...rows.keys()].sort((a, b) => a - b);
  for (const depth of depths) {
    const ids = rows.get(depth)!;
    const widths = ids.map((id) => width.get(id)!);
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, ids.length - 1);
    let cursor = centerX - total / 2;
    ids.forEach((id, i) => {
      center.set(id, cursor + widths[i] / 2);
      cursor += widths[i] + gap;
    });
  }

  const above = new Map<string, string[]>();
  const below = new Map<string, string[]>();
  for (const edge of edges) {
    const d1 = depthOf.get(edge.from);
    const d2 = depthOf.get(edge.to);
    if (d1 === undefined || d2 === undefined || d1 === d2) continue;
    const [upper, lower] = d1 < d2 ? [edge.from, edge.to] : [edge.to, edge.from];
    below.set(upper, [...(below.get(upper) ?? []), lower]);
    above.set(lower, [...(above.get(lower) ?? []), upper]);
  }

  const pull = (depth: number, neighbours: Map<string, string[]>) => {
    const ids = rows.get(depth)!;
    const desired = ids.map((id) => {
      const near = (neighbours.get(id) ?? [])
        .map((other) => center.get(other))
        .filter((c): c is number => c !== undefined);
      return near.length > 0 ? mean(near) : center.get(id)!;
    });
    const placed = placeRow(desired, ids.map((id) => width.get(id)!), gap);
    ids.forEach((id, i) => center.set(id, placed[i]));
  };

  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    for (const depth of depths) pull(depth, above);
    for (const depth of [...depths].reverse()) pull(depth, below);
  }
  return center;
};

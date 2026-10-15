import { separateGroups } from "./group-separation";
import { assignCenters, orderRows } from "./layered-order";
import type { Placement, PlacementEngine, PlacementInput } from "./types";

const ORIGIN_X = 960;
const ORIGIN_Y = 150;

/**
 * Connected components of the graph, where members of one group also count as connected (a group
 * frame must be able to hold exactly its members, so they have to be laid out together). Returned
 * largest first, ties by first appearance, so the result is deterministic.
 */
export const findComponents = (input: PlacementInput): string[][] => {
  const parent = new Map(input.nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  input.edges.forEach((e) => union(e.from, e.to));
  input.groups.forEach((g) => g.nodeIds.slice(1).forEach((id) => union(g.nodeIds[0], id)));

  const byRoot = new Map<string, string[]>();
  input.nodes.forEach((n) => {
    const root = find(n.id);
    byRoot.set(root, [...(byRoot.get(root) ?? []), n.id]);
  });
  const firstIndex = new Map(input.nodes.map((n, i) => [n.id, i]));
  return [...byRoot.values()].sort((a, b) => b.length - a.length || firstIndex.get(a[0])! - firstIndex.get(b[0])!);
};

/** One connected component: rows by depth, barycentre ordering, x placement. Origin at (0, 0). */
const placeComponent = (input: PlacementInput, ids: string[]): { placement: Placement; width: number } => {
  const keep = new Set(ids);
  const nodes = input.nodes.filter((n) => keep.has(n.id));
  const edges = input.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const layoutNodes = nodes.map(({ id, depth, width, cluster, clusterPath }) => ({ id, depth, width, cluster, clusterPath }));
  const rows = orderRows(layoutNodes, edges);
  const centers = assignCenters(rows, layoutNodes, edges, { gap: input.gaps.horizontal, centerX: 0 });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const placement: Placement = new Map();
  let top = 0;
  [...rows.keys()]
    .sort((a, b) => a - b)
    .forEach((depth) => {
      const rowIds = rows.get(depth)!;
      const rowHeight = Math.max(...rowIds.map((id) => byId.get(id)!.height));
      rowIds.forEach((id) => {
        const node = byId.get(id)!;
        placement.set(id, {
          x: (centers.get(id) ?? 0) - node.width / 2,
          y: top + (rowHeight - node.height) / 2, // centre each node on its row
        });
      });
      top += rowHeight + input.gaps.vertical;
    });

  const minX = Math.min(...[...placement.values()].map((p) => p.x));
  const maxX = Math.max(...[...placement.entries()].map(([id, p]) => p.x + byId.get(id)!.width));
  const shifted: Placement = new Map([...placement.entries()].map(([id, p]) => [id, { x: p.x - minX, y: p.y }]));
  return { placement: shifted, width: maxX - minX };
};

/**
 * The in-repo layered layout. Each connected component (plus the groups tying nodes together) is
 * laid out on its own (rows by depth, barycentre ordering inside rows with nested groups kept
 * adjacent, then x placement) and the components are packed left to right. A component's frame can
 * therefore never be crossed by an unrelated component's nodes. Rows are as tall as their tallest
 * node, so nodes of different heights never overlap and the gap between rows stays constant.
 */
export const placeLayered: PlacementEngine = (input) => {
  const components = findComponents(input).map((ids) => placeComponent(input, ids));
  const gap = input.gaps.horizontal * 1.5 + input.gaps.groupRoom;
  const total = components.reduce((sum, c, i) => sum + c.width + (i > 0 ? gap : 0), 0);
  const placement: Placement = new Map();
  let cursor = ORIGIN_X - total / 2;
  components.forEach((component) => {
    component.placement.forEach((p, id) => placement.set(id, { x: cursor + p.x, y: ORIGIN_Y + p.y }));
    cursor += component.width + gap;
  });
  return separateGroups(placement, input);
};

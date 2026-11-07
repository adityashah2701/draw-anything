import type { ELK, ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import type { Placement, PlacementInput } from "../types";

/**
 * ELK (elkjs) as a node-placement engine. It receives exactly what the layered engine receives:
 * the same sized nodes, edges (with label widths) and gaps. Only node positions are taken back;
 * connectors are routed by the same router and labels placed by the same placer, so any
 * difference in the results comes from where ELK puts the nodes.
 */

const GROUP_PADDING = { top: 44, side: 20, bottom: 20 };

interface GroupTree {
  /** group id -> parent group id (undefined = top level) */
  parent: Map<string, string | undefined>;
  /** node id -> innermost group id */
  groupOf: Map<string, string>;
}

/**
 * Groups may overlap arbitrarily; a compound layout needs a tree. A group joins the tree under the
 * smallest group that contains it entirely, and is left out when it only partly overlaps one.
 */
const buildGroupTree = (input: PlacementInput): GroupTree => {
  const sets = new Map(input.groups.map((g) => [g.id, new Set(g.nodeIds)]));
  const accepted: string[] = [];
  const parent = new Map<string, string | undefined>();
  [...input.groups]
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length || a.id.localeCompare(b.id))
    .forEach((group) => {
      const mine = sets.get(group.id)!;
      let enclosing: string | undefined;
      for (const id of accepted) {
        const other = sets.get(id)!;
        const common = [...mine].filter((n) => other.has(n)).length;
        if (common === 0) continue;
        if (common === mine.size && other.size > mine.size) {
          if (enclosing === undefined || other.size < sets.get(enclosing)!.size) enclosing = id;
        } else if (common === mine.size && other.size === mine.size) {
          return; // duplicate member set
        } else {
          return; // partial overlap: cannot be nested
        }
      }
      accepted.push(group.id);
      parent.set(group.id, enclosing);
    });
  const groupOf = new Map<string, string>();
  for (const id of accepted) {
    for (const node of sets.get(id)!) {
      const current = groupOf.get(node);
      if (current === undefined || sets.get(id)!.size < sets.get(current)!.size) groupOf.set(node, id);
    }
  }
  return { parent, groupOf };
};

export const buildElkGraph = (input: PlacementInput, overrides: Record<string, string> = {}): ElkNode => {
  const tree = buildGroupTree(input);
  const nodeNodes = new Map<string, ElkNode>(
    input.nodes.map((n) => [n.id, { id: n.id, width: n.width, height: n.height }]),
  );
  const groupNodes = new Map<string, ElkNode>(
    [...tree.parent.keys()].map((id) => [
      `group:${id}`,
      {
        id: `group:${id}`,
        children: [],
        layoutOptions: {
          "elk.padding": `[top=${GROUP_PADDING.top},left=${GROUP_PADDING.side},bottom=${GROUP_PADDING.bottom},right=${GROUP_PADDING.side}]`,
        },
      },
    ]),
  );
  const root: ElkNode = { id: "root", children: [] };
  const attach = (child: ElkNode, groupId: string | undefined) => {
    (groupId ? groupNodes.get(`group:${groupId}`)!.children! : root.children!).push(child);
  };
  // Deterministic order: input order for nodes, group id order for groups.
  for (const [id, parentId] of [...tree.parent.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    attach(groupNodes.get(`group:${id}`)!, parentId);
  }
  for (const node of input.nodes) attach(nodeNodes.get(node.id)!, tree.groupOf.get(node.id));

  root.edges = input.edges.map<ElkExtendedEdge>((edge, index) => ({
    id: `e${index}`,
    sources: [edge.from],
    targets: [edge.to],
    labels: edge.labelWidth ? [{ text: "label", width: edge.labelWidth + 8, height: 20 }] : undefined,
  }));

  root.layoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    // ELK pads groups itself, so the room the layered engine reserves for frames is not added twice.
    "elk.spacing.nodeNode": String(input.gaps.horizontal - input.gaps.groupRoom / 2),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(input.gaps.vertical - input.gaps.groupRoom),
    "elk.layered.spacing.edgeNodeBetweenLayers": "24",
    "elk.spacing.edgeNode": "20",
    "elk.spacing.edgeEdge": "14",
    "elk.edgeLabels.inline": "false",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    // keep the input order as the tiebreaker so identical input gives identical output
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.randomSeed": "1",
    ...overrides,
  };
  return root;
};

/** Absolute top-left of every leaf node, shifted so the drawing is centred at the layered engine's origin. */
export const readElkPlacement = (laid: ElkNode, nodeIds: Set<string>): Placement => {
  const absolute = new Map<string, { x: number; y: number; width: number; height: number }>();
  const walk = (node: ElkNode, ox: number, oy: number) => {
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      if (nodeIds.has(child.id)) absolute.set(child.id, { x, y, width: child.width ?? 0, height: child.height ?? 0 });
      walk(child, x, y);
    }
  };
  walk(laid, 0, 0);
  const all = [...absolute.values()];
  const minX = Math.min(...all.map((n) => n.x));
  const maxX = Math.max(...all.map((n) => n.x + n.width));
  const minY = Math.min(...all.map((n) => n.y));
  const shiftX = 960 - (minX + maxX) / 2;
  const shiftY = 150 - minY;
  return new Map([...absolute.entries()].map(([id, n]) => [id, { x: n.x + shiftX, y: n.y + shiftY }]));
};

let elk: ELK | null = null;
const getElk = async (): Promise<ELK> => {
  if (!elk) {
    // elk.bundled.js runs the layout on the calling thread: no web worker, fine for a server route.
    const mod = (await import("elkjs/lib/elk.bundled.js")) as { default: new () => ELK };
    elk = new mod.default();
  }
  return elk;
};

export type AsyncPlacementEngine = (input: PlacementInput) => Promise<Placement>;

export const createElkEngine =
  (overrides: Record<string, string> = {}): AsyncPlacementEngine =>
  async (input) => {
    if (input.nodes.length === 0) return new Map();
    const laid = await (await getElk()).layout(buildElkGraph(input, overrides));
    return readElkPlacement(laid, new Set(input.nodes.map((n) => n.id)));
  };

export const placeElk = createElkEngine();

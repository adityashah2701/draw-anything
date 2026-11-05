import type { ParsedDiagramCode } from "@/features/diagram-code/types";
import { serializeDiagramCode, type SerializableGraph } from "@/features/diagram-code/serialize";

/** One picture holds about this many parts before it stops reading as a message. */
export const MAX_NODES_PER_VIEW = 24;

export interface DiagramView {
  /** `overview` shows each top-level group as one box; a focus view shows one group's parts in detail. */
  kind: "overview" | "focus";
  title: string;
  code: string;
}

/** Every top-level group, with nodes of nested groups counted in it. */
const topGroups = (parsed: ParsedDiagramCode) => parsed.groups.filter((g) => !g.parentId);

const graphOf = (parsed: ParsedDiagramCode, title: string, nodes: SerializableGraph["nodes"], edges: SerializableGraph["edges"]): SerializableGraph => ({
  diagramType: parsed.diagramType,
  direction: parsed.direction,
  title,
  nodes,
  edges,
  groups: [],
});

/** True when a diagram is too big for one picture and has groups to split along. */
export const needsViews = (parsed: ParsedDiagramCode): boolean => parsed.nodes.length > MAX_NODES_PER_VIEW && topGroups(parsed).length >= 2;

/**
 * Splits a large diagram into an overview and one focused view per top-level group. The overview shows every
 * group as one node and every connection between groups once; a focus view shows the group's own parts and
 * connections, with each outside neighbour as a single stand-in node, so the reader keeps their bearings.
 * Pure: it only rewrites diagram code, so the same layout engine draws every view.
 */
export const planViews = (parsed: ParsedDiagramCode): DiagramView[] => {
  const groups = topGroups(parsed);
  if (groups.length < 2) return [];
  const owner = new Map<string, string>();
  for (const g of groups) for (const id of g.nodeIds) owner.set(id, g.id);
  const nodeById = new Map(parsed.nodes.map((n) => [n.id, n]));
  const slot = (id: string) => owner.get(id) ?? `node:${id}`;

  // Overview: a box per group, plus any node that belongs to no group.
  const overviewNodes: SerializableGraph["nodes"] = [
    ...groups.map((g) => ({ id: g.id, label: `${g.label} (${g.nodeIds.length})`, kind: "service" })),
    ...parsed.nodes.filter((n) => !owner.has(n.id)).map((n) => ({ id: `node:${n.id}`, label: n.label, kind: n.kind, icon: n.icon })),
  ];
  const seen = new Set<string>();
  const overviewEdges: SerializableGraph["edges"] = [];
  for (const e of parsed.edges) {
    const from = slot(e.from);
    const to = slot(e.to);
    if (from === to || seen.has(`${from}>${to}`)) continue;
    seen.add(`${from}>${to}`);
    overviewEdges.push({ from, to, dashed: e.dashed });
  }
  const views: DiagramView[] = [{ kind: "overview", title: parsed.title ? `${parsed.title}: overview` : "Overview", code: serializeDiagramCode(graphOf(parsed, parsed.title ? `${parsed.title}: overview` : "Overview", overviewNodes, overviewEdges)) }];

  for (const g of groups) {
    const inside = new Set(g.nodeIds);
    const nodes: SerializableGraph["nodes"] = g.nodeIds.flatMap((id) => {
      const n = nodeById.get(id);
      return n ? [{ id: n.id, label: n.label, kind: n.kind, icon: n.icon, shape: n.shape }] : [];
    });
    const edges: SerializableGraph["edges"] = [];
    const standIns = new Map<string, string>();
    const stand = (id: string) => {
      const key = owner.get(id) ?? `node:${id}`;
      if (!standIns.has(key)) {
        standIns.set(key, `ext:${key}`);
        const label = owner.has(id) ? (groups.find((x) => x.id === owner.get(id))?.label ?? key) : (nodeById.get(id)?.label ?? key);
        nodes.push({ id: `ext:${key}`, label, kind: "external" });
      }
      return standIns.get(key)!;
    };
    for (const e of parsed.edges) {
      const a = inside.has(e.from);
      const b = inside.has(e.to);
      if (!a && !b) continue;
      edges.push({ from: a ? e.from : stand(e.from), to: b ? e.to : stand(e.to), label: e.label, dashed: e.dashed || !(a && b) });
    }
    views.push({ kind: "focus", title: g.label, code: serializeDiagramCode(graphOf(parsed, g.label, nodes, edges)) });
  }
  return views;
};

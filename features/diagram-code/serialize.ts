import type { AIDiagramType } from "@/features/ai/types";

export interface SerializableGraph {
  diagramType?: AIDiagramType;
  title?: string;
  nodes: Array<{ id: string; label: string; kind?: string; icon?: string; shape?: "diamond" | "pill" | "icon"; color?: string; x?: number; y?: number; width?: number; height?: number }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    dashed?: boolean;
    bidirectional?: boolean;
    plain?: boolean;
    color?: string;
    fromSide?: "top" | "right" | "bottom" | "left";
    toSide?: "top" | "right" | "bottom" | "left";
  }>;
  groups: Array<{ id: string; label: string; nodeIds: string[] }>;
}

const CONNECTOR_IN_NAME = /(^|\s)(<-->|-->|<>|--|-|>|<)(\s|$)/;
const DIRECTIVE_LOOKALIKE = /^(title|type|direction)\s/i;

const IMPLIED_SHAPE: Record<string, string> = { decision: "diamond", start: "pill", end: "pill" };

const clean = (text: string) => text.replace(/\s+/g, " ").replace(/"/g, "'").trim();

/** Quote a name only when the parser would otherwise misread it. */
const writeName = (name: string): string =>
  name === "" ||
  /[\[\]{}",:]/.test(name) ||
  /^(\/\/|#)/.test(name) ||
  DIRECTIVE_LOOKALIKE.test(name) ||
  CONNECTOR_IN_NAME.test(name)
    ? `"${name}"`
    : name;

const connectorFor = (edge: { dashed?: boolean; bidirectional?: boolean; plain?: boolean }) =>
  edge.plain ? (edge.dashed ? "--" : "-") : edge.bidirectional ? (edge.dashed ? "<-->" : "<>") : edge.dashed ? "-->" : ">";

/**
 * Write a graph as diagram code. The output parses back to the same nodes,
 * kinds, connections, labels, flags and nested groups.
 */
export const serializeDiagramCode = (graph: SerializableGraph): string => {
  // Unique display names; the real label goes in a property when they differ.
  const nameOf = new Map<string, string>();
  const used = new Set<string>();
  graph.nodes.forEach((node, index) => {
    const base = clean(node.label) || `Untitled ${index + 1}`;
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} ${n}`;
    used.add(name);
    nameOf.set(node.id, name);
  });
  const known = new Set(nameOf.keys());

  const declaration = (node: SerializableGraph["nodes"][number]) => {
    const name = nameOf.get(node.id)!;
    const props: string[] = [];
    if (node.kind && node.kind !== "generic") props.push(`kind: ${node.kind}`);
    if (node.icon) props.push(`icon: ${node.icon}`);
    // A kind already implies its shape (decision: diamond, start/end: pill), so only say it when it adds something.
    if (node.shape && node.shape !== IMPLIED_SHAPE[node.kind ?? ""]) props.push(`shape: ${node.shape}`);
    if (node.color) props.push(`color: ${node.color}`);
    // Where it is and how big, so the code can reproduce the picture exactly.
    if (node.x !== undefined) props.push(`x: ${Math.round(node.x)}`);
    if (node.y !== undefined) props.push(`y: ${Math.round(node.y)}`);
    if (node.width !== undefined) props.push(`w: ${Math.round(node.width)}`);
    if (node.height !== undefined) props.push(`h: ${Math.round(node.height)}`);
    if (clean(node.label) !== name) props.push(`label: "${clean(node.label)}"`);
    return props.length > 0 ? `${writeName(name)} [${props.join(", ")}]` : writeName(name);
  };

  // Groups: members limited to known nodes, identical sets dropped, nesting by containment.
  const seen = new Set<string>();
  const groups = graph.groups
    .map((group) => ({
      ...group,
      label: clean(group.label) || "Group",
      nodeIds: Array.from(new Set(group.nodeIds.filter((id) => known.has(id)))),
    }))
    .filter((group) => {
      if (group.nodeIds.length === 0) return false;
      const key = [...group.nodeIds].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length);

  const parentOf = new Map<string, string | undefined>();
  groups.forEach((group, i) => {
    const members = new Set(group.nodeIds);
    // The smallest earlier (larger) group that contains all of this group's nodes.
    for (let j = i - 1; j >= 0; j -= 1) {
      const candidate = groups[j];
      if (candidate.nodeIds.length > members.size && group.nodeIds.every((id) => candidate.nodeIds.includes(id))) {
        parentOf.set(group.id, candidate.id);
        break;
      }
    }
  });
  // Groups are sorted largest first, so later (smaller) groups overwrite: the
  // result is each node's innermost group.
  const innermost = new Map<string, string>();
  groups.forEach((group) => group.nodeIds.forEach((id) => innermost.set(id, group.id)));

  const lines: string[] = [];
  const emitGroup = (group: (typeof groups)[number], depth: number) => {
    const pad = "  ".repeat(depth);
    lines.push(`${pad}${writeName(group.label)} {`);
    graph.nodes
      .filter((node) => innermost.get(node.id) === group.id)
      .forEach((node) => lines.push(`${pad}  ${declaration(node)}`));
    groups
      .filter((child) => parentOf.get(child.id) === group.id)
      .forEach((child) => emitGroup(child, depth + 1));
    lines.push(`${pad}}`);
  };

  if (graph.diagramType) lines.push(`type ${graph.diagramType}`);
  if (graph.title) lines.push(`title ${clean(graph.title)}`);
  if (lines.length > 0) lines.push("");

  groups.filter((group) => !parentOf.has(group.id)).forEach((group) => emitGroup(group, 0));
  graph.nodes
    .filter((node) => !innermost.has(node.id))
    .forEach((node) => lines.push(declaration(node)));

  const edgeLines = graph.edges
    .filter((edge) => known.has(edge.from) && known.has(edge.to))
    .map((edge) => {
      const edgeProps = [
        ...(edge.color ? [`color: ${edge.color}`] : []),
        ...(edge.fromSide ? [`from: ${edge.fromSide}`] : []),
        ...(edge.toSide ? [`to: ${edge.toSide}`] : []),
      ];
      const props = edgeProps.length > 0 ? ` [${edgeProps.join(", ")}]` : "";
      const label = edge.label ? `: ${clean(edge.label)}${props}` : props ? `:${props}` : "";
      return `${writeName(nameOf.get(edge.from)!)} ${connectorFor(edge)} ${writeName(nameOf.get(edge.to)!)}${label}`;
    });
  if (edgeLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...edgeLines);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
};

import { resolveIconId } from "@/core/icons/registry";
import { normalizeSemanticKind } from "@/features/ai/schemas";
import type { ParsedDiagramCode } from "@/features/diagram-code/types";

export interface LintFinding {
  /** Stable id, for tests and the eval. */
  rule: string;
  advice: string;
}

/** What a layout dry-run measured; the subset the lint rules read. */
export interface LintMetrics {
  edgeCrossings: number;
  longestEdge: number;
  labelsColliding: number;
  groupsDropped: number;
}

const LONG_LABEL = 28;
const LONG_EDGE_PX = 900;

/**
 * Design review of a diagram, as rules a model can act on. These are judgement aids phrased as
 * advice, not limits: a diagram can ignore any of them. Pure and deterministic.
 */
export const lintDiagram = (parsed: ParsedDiagramCode, metrics?: LintMetrics): LintFinding[] => {
  const findings: LintFinding[] = [];
  const add = (rule: string, advice: string) => findings.push({ rule, advice });
  const { nodes, edges, groups } = parsed;
  if (nodes.length === 0) return [{ rule: "empty", advice: "No nodes yet. Declare the main components and connect them." }];

  const named = new Map<string, string>();
  nodes.forEach((n) => {
    named.set(n.name, n.id);
    named.set(n.id, n.id);
  });
  const degree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, number>();
  for (const e of edges) {
    const from = named.get(e.from);
    const to = named.get(e.to);
    if (from) {
      degree.set(from, (degree.get(from) ?? 0) + 1);
      outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
    }
    if (to) degree.set(to, (degree.get(to) ?? 0) + 1);
  }

  const orphans = nodes.filter((n) => (degree.get(n.id) ?? 0) === 0 && nodes.length > 1).map((n) => n.label);
  if (orphans.length > 0) add("orphan-node", `Not connected to anything: ${orphans.slice(0, 5).join(", ")}. Connect each or remove it.`);

  const labels = new Map<string, number>();
  nodes.forEach((n) => labels.set(n.label.toLowerCase(), (labels.get(n.label.toLowerCase()) ?? 0) + 1));
  const dupes = [...labels].filter(([, n]) => n > 1).map(([l]) => l);
  if (dupes.length > 0) add("duplicate-label", `Repeated labels: ${dupes.slice(0, 4).join(", ")}. Give each node a distinct name (e.g. add its role).`);

  const long = nodes.filter((n) => n.label.length > LONG_LABEL).map((n) => n.label);
  if (long.length > 0) add("long-label", `Labels over ${LONG_LABEL} characters wrap to many lines: ${long.slice(0, 3).join("; ")}. Shorten to 1-4 words.`);

  if (groups.length === 0 && nodes.length > 8) {
    add("no-groups", "More than 8 nodes and no groups. Group nodes by tier or domain (e.g. Frontend, Services, Data) with `Name { ... }`.");
  }

  const generic = nodes.filter((n) => {
    const ref = n.icon ?? n.kind;
    const kind = normalizeSemanticKind(ref);
    return kind === "generic" && !(resolveIconId(ref) && resolveIconId(ref) !== "generic");
  });
  if (nodes.length >= 4 && generic.length / nodes.length > 0.4) {
    add("generic-icons", `${generic.length} of ${nodes.length} nodes have no recognisable icon/kind. Use search_icons and set icon: or kind: on each (e.g. ${generic.slice(0, 2).map((n) => n.label).join(", ")}).`);
  }

  const bareIcons = nodes.filter((n) => n.shape === "icon" && generic.includes(n));
  if (bareIcons.length > 0) {
    add("icon-shape-needs-icon", `shape: icon needs an icon id or a kind with one, otherwise the node is drawn as a plain box: ${bareIcons.slice(0, 3).map((n) => n.label).join(", ")}. Use search_icons.`);
  }

  const labelled = edges.filter((e) => e.label).length;
  if (edges.length >= 5 && labelled / edges.length > 0.6) {
    add("label-heavy", `${labelled} of ${edges.length} connections carry labels. Keep labels only where the relationship is not obvious (protocols, conditions, yes/no).`);
  }

  const wide = [...outgoing].filter(([, n]) => n > 5).map(([id]) => nodes.find((n) => n.id === id)?.label ?? id);
  if (wide.length > 0) add("wide-fan-out", `${wide.slice(0, 3).join(", ")} connect to more than 5 targets. Group the targets, or route through an intermediate component.`);

  if (metrics) {
    if (metrics.edgeCrossings > Math.max(3, Math.round(edges.length * 0.4))) {
      add("crossings", `${metrics.edgeCrossings} connector crossings. Reorder declarations so connected nodes are adjacent, or group tightly coupled nodes.`);
    }
    if (metrics.longestEdge > LONG_EDGE_PX) {
      add("long-edge", `One connector is ${metrics.longestEdge}px long. Move its endpoints closer in the flow (declare them near each other / same group).`);
    }
    if (metrics.labelsColliding > 0) add("label-collisions", `${metrics.labelsColliding} edge labels overlap something. Remove or shorten labels on busy connections.`);
    if (metrics.groupsDropped > 0) add("group-dropped", `${metrics.groupsDropped} groups could not be drawn without covering other nodes. Make group membership cleaner (a node in one group, groups not interleaved).`);
  }
  return findings;
};

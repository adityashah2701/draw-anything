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

  // The structured families have their own shapes; icons and plain boxes there read as a generic architecture.
  const WANT: Record<string, { shapes: string[]; fix: string }> = {
    "entity-relationship": { shapes: ["entity"], fix: 'a table: `Orders [shape: entity, rows: "id int pk; customer_id int fk -> customers.id"]`' },
    class: { shapes: ["class"], fix: 'a class: `Order [shape: class, attributes: "-id: int", operations: "+pay(): void"]` (or shape: interface / enum)' },
    sequence: { shapes: ["lifeline"], fix: "a lifeline: `Web App [shape: lifeline]`" },
    "mind-map": { shapes: ["topic"], fix: "a topic: `Idea [shape: topic]`" },
  };
  const want = parsed.diagramType ? WANT[parsed.diagramType] : undefined;
  const wrong = want ? nodes.filter((n) => !want.shapes.includes(n.shape ?? "")).map((n) => n.label) : [];
  if (want && wrong.length > 0) add("family-shapes", `In a ${parsed.diagramType} diagram every node must be ${want.fix}. Not yet: ${wrong.slice(0, 6).join(", ")}. Drop icon: and shape: icon there.`);

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
  if (!want && nodes.length >= 4 && generic.length / nodes.length > 0.4) {
    add("generic-icons", `${generic.length} of ${nodes.length} nodes have no recognisable icon/kind. Use search_icons and set icon: or kind: on each (e.g. ${generic.slice(0, 2).map((n) => n.label).join(", ")}).`);
  }

  const bareIcons = nodes.filter((n) => n.shape === "icon" && generic.includes(n));
  if (bareIcons.length > 0) {
    add("icon-shape-needs-icon", `shape: icon needs an icon id or a kind with one, otherwise the node is drawn as a plain box: ${bareIcons.slice(0, 3).map((n) => n.label).join(", ")}. Use search_icons.`);
  }

  const labelled = edges.filter((e) => e.label).length;
  // Every sequence message carries its action, so a labelled majority is right there.
  if (parsed.diagramType !== "sequence" && edges.length >= 5 && labelled / edges.length > 0.6) {
    add("label-heavy", `${labelled} of ${edges.length} connections carry labels. Keep labels only where the relationship is not obvious (protocols, conditions, yes/no).`);
  }

  const wide = [...outgoing].filter(([, n]) => n > 5).map(([id]) => nodes.find((n) => n.id === id)?.label ?? id);
  if (wide.length > 0) add("wide-fan-out", `${wide.slice(0, 3).join(", ")} connect to more than 5 targets. Group the targets, or route through an intermediate component.`);

  findings.push(...familyRules(parsed, (ref) => named.get(ref)));

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

const MANY = new Set(["many", "zero-or-many", "one-or-many"]);

/**
 * The rules of each diagram family, beyond geometry: what a reviewer of an ER model, a sequence or a flowchart would
 * point out first. Each finding names the parts and says how to fix them in diagram code.
 */
const familyRules = (parsed: ParsedDiagramCode, idOf: (ref: string) => string | undefined): LintFinding[] => {
  const out: LintFinding[] = [];
  const add = (rule: string, advice: string) => out.push({ rule, advice });
  const { nodes, edges, diagramType } = parsed;
  const nameOf = (ref: string) => nodes.find((n) => n.id === idOf(ref))?.label ?? ref;
  const ends = edges.map((e) => ({ e, from: idOf(e.from), to: idOf(e.to) }));

  if (diagramType === "entity-relationship") {
    const noKey = nodes.filter((n) => n.shape === "entity" && !/\bpk\b/i.test(n.data?.rows ?? "")).map((n) => n.label);
    if (noKey.length > 0) add("er-no-primary-key", `Tables without a primary key: ${noKey.slice(0, 5).join(", ")}. Mark one row \`pk\` (e.g. \`id int pk\`).`);
    const bare = edges.filter((e) => e.relation?.kind !== "er-relationship" || !e.relation.start?.cardinality || !e.relation.end?.cardinality);
    if (bare.length > 0) add("er-missing-cardinality", `Relationships without a cardinality at both ends: ${bare.slice(0, 4).map((e) => `${nameOf(e.from)} > ${nameOf(e.to)}`).join(", ")}. Write \`[relation: er-relationship, from: one, to: zero-or-many]\`.`);
    const manyMany = edges.filter((e) => MANY.has(e.relation?.start?.cardinality ?? "") && MANY.has(e.relation?.end?.cardinality ?? ""));
    if (manyMany.length > 0) add("er-many-to-many", `Many-to-many drawn directly: ${manyMany.slice(0, 3).map((e) => `${nameOf(e.from)} > ${nameOf(e.to)}`).join(", ")}. Add a junction table (\`variant: junction\`) with a one-to-many from each side.`);
    // The table that holds the foreign key is the "many" side; a relation that says the opposite is drawn upside down.
    const stem = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ies|es|s)$/, "");
    const references = (n: (typeof nodes)[number] | undefined, other: (typeof nodes)[number] | undefined) =>
      !!n && !!other && parseRefs(n.data?.rows).some((table) => stem(table) === stem(other.label) || stem(table) === stem(other.id));
    const flipped = ends.filter(({ e, from, to }) => {
      const start = e.relation?.start?.cardinality ?? "";
      const end = e.relation?.end?.cardinality ?? "";
      const a = nodes.find((n) => n.id === from);
      const b = nodes.find((n) => n.id === to);
      return (MANY.has(end) && !MANY.has(start) && references(a, b) && !references(b, a)) || (MANY.has(start) && !MANY.has(end) && references(b, a) && !references(a, b));
    });
    if (flipped.length > 0) add("er-cardinality-against-key", `The cardinality is the wrong way round for: ${flipped.slice(0, 4).map(({ e }) => `${nameOf(e.from)} > ${nameOf(e.to)}`).join(", ")}. The table with the foreign key is the "many" side.`);
    const linked = new Set(ends.flatMap((x) => [x.from, x.to]));
    const fkOnly = nodes.filter((n) => n.shape === "entity" && /\bfk\b|->/i.test(n.data?.rows ?? "") && !linked.has(n.id)).map((n) => n.label);
    if (fkOnly.length > 0) add("er-fk-without-relation", `Tables with foreign keys but no relationship line: ${fkOnly.slice(0, 4).join(", ")}. Connect each to the table it references.`);
  }

  if (diagramType === "sequence") {
    const unanswered = ends.filter(({ e, from, to }, i) => e.relation?.kind === "sync-message" && !ends.slice(i + 1).some((r) => r.from === to && r.to === from && r.e.relation?.kind === "return-message"));
    if (unanswered.length > 0) add("sequence-no-return", `Synchronous calls with no return after them: ${unanswered.slice(0, 4).map(({ e }) => `${nameOf(e.from)} > ${nameOf(e.to)}`).join(", ")}. Add the reply (\`[relation: return]\`), or make the call async.`);
  }

  // A high-level design: someone uses it, and every service does something (calls a store, a queue or another part).
  if ((diagramType === "architecture" || !diagramType) && nodes.length >= 8) {
    const what = (n: (typeof nodes)[number]) => `${n.icon ?? ""} ${n.kind ?? ""} ${n.label}`.toLowerCase();
    const entry = (n: (typeof nodes)[number]) => /^(user|users|client|mobile|browser|device|laptop)$/.test((n.icon ?? n.kind ?? "").toLowerCase()) || /\b(app|client|customer|user)s?$/i.test(n.label);
    if (!nodes.some(entry)) add("hld-no-entry", "Nobody uses this system: add the clients or users that start the main path (Mobile App, Web App) and connect them to the edge.");
    const leaving = new Set(ends.map((x) => x.from));
    const idle = nodes.filter((n) => /\bservice\b/.test(what(n)) && !leaving.has(n.id)).map((n) => n.label);
    if (idle.length > 0) add("hld-idle-service", `Services that call nothing: ${idle.slice(0, 4).join(", ")}. Connect each to the store, queue or service it uses.`);
  }

  if (diagramType === "flowchart" || diagramType === "workflow") {
    const starts = nodes.filter((n) => n.kind === "start");
    if (starts.length !== 1) add("flow-one-start", starts.length === 0 ? "No start. Add exactly one node with kind: start." : `${starts.length} starts (${starts.map((n) => n.label).join(", ")}). A flowchart has exactly one.`);
    const leaving = new Set(ends.map((x) => x.from));
    const dead = nodes.filter((n) => n.kind !== "end" && !leaving.has(n.id) && nodes.length > 1).map((n) => n.label);
    if (dead.length > 0) add("flow-dead-end", `Steps that lead nowhere: ${dead.slice(0, 4).join(", ")}. Connect each onward, or make it an end (kind: end).`);
  }
  return out;
};

/** The tables a row list references (`-> teams.id` and `references teams(id)`). */
const parseRefs = (rows: string | undefined): string[] =>
  [...(rows ?? "").matchAll(/(?:->|references)\s*([\w]+)/gi)].map((m) => m[1]);

import { parseDiagramCode } from "@/features/diagram-code/parse";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import type { ParsedDiagramCode, ParsedNode } from "@/features/diagram-code/types";
import type { EdgeSides } from "@/features/ai/server/canvas-compiler";
import type { NodeOffset } from "@/features/ai/server/layout/pins";
import type { ConnectionHandle } from "@/features/whiteboard/types/whiteboard.types";

/** The diagram as the builder agent has made it so far, plus the manual adjustments it chose. */
export interface BuilderState {
  /** Canonical diagram code of everything built so far. */
  code: string;
  parsed: ParsedDiagramCode;
  /** Nodes moved away from their automatic place (by node id). */
  offsets: Map<string, NodeOffset>;
  /** Connections whose sides were chosen explicitly (`fromId>toId`). */
  edgeSides: EdgeSides;
}

/**
 * Statements the agent may add in one call. Every step is a model call, and free tiers allow only a few
 * calls a minute, so steps are as big as still keeps a diagram growing in parts (the server shows each
 * step's shapes one by one). `AI_BUILDER_STEP_STATEMENTS` changes it.
 */
export const MAX_ADD_STATEMENTS = Number(process.env.AI_BUILDER_STEP_STATEMENTS) || 12;
/** One move command, and how far a node may end up from its automatic place in total: the layout already spaces things, so moves are nudges. */
const MAX_MOVE = 200;
const DEFAULT_MOVE = 60;
export const MAX_OFFSET = 240;

const HEADER = /^\s*(type|title|direction)\b/i;
const SIDES = new Set<ConnectionHandle>(["top", "right", "bottom", "left"]);

const write = (parsed: ParsedDiagramCode) =>
  serializeDiagramCode({ diagramType: parsed.diagramType, title: parsed.title, nodes: parsed.nodes, edges: parsed.edges, groups: parsed.groups });

const stateFromParsed = (
  parsed: ParsedDiagramCode,
  offsets: Map<string, NodeOffset> = new Map(),
  edgeSides: EdgeSides = new Map(),
): BuilderState => {
  const code = write(parsed);
  // Re-parse the canonical text so ids, edge order and groups are exactly what the next step will see.
  return { code, parsed: parseDiagramCode(code), offsets, edgeSides };
};

/** Kinds drawn as their own shapes (diamond, pill): a bare icon would replace them. */
const OWN_SHAPE_KINDS = new Set(["decision", "start", "end"]);

/** Every node that has an icon (or a kind with one) becomes a bare icon: `shape: icon`. For "icons only" requests. */
export const withBareIcons = (state: BuilderState): BuilderState => {
  let changed = false;
  const nodes = state.parsed.nodes.map((n) => {
    if (n.shape || OWN_SHAPE_KINDS.has((n.kind ?? "").toLowerCase()) || !(n.icon || n.kind)) return n;
    changed = true;
    return { ...n, shape: "icon" as const };
  });
  return changed ? stateFromParsed({ ...state.parsed, nodes }, state.offsets, state.edgeSides) : state;
};

export const createState = (existingCode = ""): BuilderState => stateFromParsed(parseDiagramCode(existingCode));

const isStatement = (line: string) => {
  const t = line.trim();
  return t !== "" && t !== "}" && !t.startsWith("//") && !t.startsWith("#");
};

const edgeKey = (e: { from: string; to: string; label?: string; dashed?: boolean; bidirectional?: boolean; plain?: boolean }) =>
  [e.from, e.to, e.label ?? "", e.dashed ? "d" : "", e.bidirectional ? "b" : "", e.plain ? "p" : ""].join("|");

export interface AddResult {
  state: BuilderState;
  errors: string[];
  /** Node names and `A > B` connections this call created. */
  added: string[];
  /** Statements left out because the call was over the step size. */
  skipped: number;
}

/** Adds diagram code (nodes, connections, groups) to what exists. Atomic: any error leaves the state unchanged. */
export const addLines = (state: BuilderState, text: string): AddResult => {
  const lines = text.replace(/\r/g, "").split("\n");
  const headers = lines.filter((l) => HEADER.test(l));
  // Top-level units: one statement, or a whole group block. A step keeps the first few and never cuts a block in half.
  const units: string[][] = [];
  let current: string[] = [];
  let depth = 0;
  for (const line of lines) {
    if (HEADER.test(line)) continue;
    if (depth === 0 && !isStatement(line)) continue;
    current.push(line);
    depth = Math.max(0, depth + (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0));
    if (depth === 0) {
      units.push(current);
      current = [];
    }
  }
  if (current.length > 0) units.push(current);
  const kept = units.slice(0, MAX_ADD_STATEMENTS);
  const skipped = units.length - kept.length;
  const body = kept.flat();

  const before = state.code ? `${state.code}\n` : "";
  const combined = `${before}${body.join("\n")}`;
  const parsed = parseDiagramCode(combined);
  const prior = before.split("\n").length - 1;
  const errors = parsed.issues
    .filter((i) => i.severity === "error")
    .map((i) => (i.line > prior ? `line ${i.line - prior}: ${i.message}` : i.message));
  if (errors.length > 0) return { state, errors, added: [], skipped };

  if (headers.length > 0) {
    const head = parseDiagramCode(`${headers.join("\n")}\nX`);
    if (head.diagramType) parsed.diagramType = head.diagramType;
    if (head.title) parsed.title = head.title;
  }
  const seen = new Set<string>();
  parsed.edges = parsed.edges.filter((e) => (seen.has(edgeKey(e)) ? false : (seen.add(edgeKey(e)), true)));

  const knownNodes = new Set(state.parsed.nodes.map((n) => n.id));
  const knownEdges = new Set(state.parsed.edges.map(edgeKey));
  const nameOf = new Map(parsed.nodes.map((n) => [n.id, n.name]));
  const added = [
    ...parsed.nodes.filter((n) => !knownNodes.has(n.id)).map((n) => n.name),
    ...parsed.edges.filter((e) => !knownEdges.has(edgeKey(e))).map((e) => `${nameOf.get(e.from)} > ${nameOf.get(e.to)}`),
  ];
  return { state: stateFromParsed(parsed, state.offsets, state.edgeSides), errors: [], added, skipped };
};

export interface AdjustResult {
  state: BuilderState;
  /** What each command did, one line each. */
  applied: string[];
  /** Commands that could not be applied, with the reason. */
  errors: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const findNode = (nodes: ParsedNode[], name: string): ParsedNode | string => {
  const wanted = norm(name.replace(/^"|"$/g, ""));
  const hit = nodes.find((n) => norm(n.name) === wanted) ?? nodes.find((n) => norm(n.label) === wanted);
  if (hit) return hit;
  const close = nodes.filter((n) => norm(n.name).includes(wanted) || wanted.includes(norm(n.name))).slice(0, 3).map((n) => n.name);
  return `no node named "${name.trim()}"${close.length > 0 ? ` (did you mean ${close.join(", ")}?)` : ""}`;
};

const splitPair = (text: string): [string, string] | undefined => {
  const m = text.match(/^(.+?)\s*(?:>|->)\s*(.+)$/);
  return m ? [m[1], m[2]] : undefined;
};

export interface Centres {
  get(nodeId: string): { x: number; y: number } | undefined;
}

/**
 * Applies adjustment commands, one per line:
 *   move <Node>: left|right|up|down [distance]   or   move <Node>: dx, dy
 *   align <Node> with <Other>: x|y               (same column / same row)
 *   sides <A> > <B>: <from side>, <to side>      (top, right, bottom, left)
 *   label <A> > <B>: text                        (empty text removes the label)
 *   remove <Node>   |   remove <A> > <B>
 *   reset <Node>    |   reset <A> > <B>           (back to the automatic place / sides)
 * Commands apply in order; a bad one is reported and the rest still run.
 */
export const adjust = (state: BuilderState, text: string, centres: Centres): AdjustResult => {
  let parsed: ParsedDiagramCode = { ...state.parsed, nodes: [...state.parsed.nodes], edges: [...state.parsed.edges], groups: state.parsed.groups.map((g) => ({ ...g, nodeIds: [...g.nodeIds] })) };
  const offsets = new Map(state.offsets);
  const edgeSides: EdgeSides = new Map(state.edgeSides);
  const applied: string[] = [];
  const errors: string[] = [];
  let structural = false;

  const fail = (line: string, why: string) => errors.push(`"${line.trim()}": ${why}`);
  const nodeOrFail = (line: string, name: string) => {
    const found = findNode(parsed.nodes, name);
    if (typeof found === "string") {
      fail(line, found);
      return undefined;
    }
    return found;
  };
  const pairOrFail = (line: string, pairText: string) => {
    const pair = splitPair(pairText);
    if (!pair) return fail(line, "expected `A > B`"), undefined;
    const a = nodeOrFail(line, pair[0]);
    const b = nodeOrFail(line, pair[1]);
    return a && b ? { a, b } : undefined;
  };
  const clamp = (v: number) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, v));
  /** Returns what was applied, which is less than asked when the node reached its limit. */
  const shift = (id: string, dx: number, dy: number) => {
    const prev = offsets.get(id) ?? { dx: 0, dy: 0 };
    const next = { dx: clamp(prev.dx + dx), dy: clamp(prev.dy + dy) };
    offsets.set(id, next);
    return { dx: next.dx - prev.dx, dy: next.dy - prev.dy, limited: next.dx - prev.dx !== dx || next.dy - prev.dy !== dy };
  };
  const limitNote = (r: { limited: boolean }) => (r.limited ? ` (limit reached: a node stays within ${MAX_OFFSET} of its automatic place; use reset)` : "");

  // Some models put several commands on one line, separated by `;`: split there too, but only before a command word.
  for (const raw of text.replace(/\r/g, "").split("\n").flatMap((l) => l.split(/;\s*(?=(?:move|align|sides|label|remove|reset)\b)/i))) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const verb = line.match(/^(move|align|sides|label|remove|reset)\b\s*(.*)$/i);
    if (!verb) {
      fail(line, "unknown command (use move, align, sides, label, remove or reset)");
      continue;
    }
    const command = verb[1].toLowerCase();
    const rest = verb[2];

    if (command === "move") {
      const m = rest.match(/^(.+?):\s*(.+)$/);
      if (!m) { fail(line, "expected `move <Node>: left|right|up|down [distance]`"); continue; }
      const node = nodeOrFail(line, m[1]);
      if (!node) continue;
      const delta = m[2].trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
      const dir = m[2].trim().match(/^(left|right|up|down)(?:\s+(\d+(?:\.\d+)?))?$/i);
      let dx = 0;
      let dy = 0;
      if (delta) {
        dx = Number(delta[1]);
        dy = Number(delta[2]);
      } else if (dir) {
        const d = Math.min(MAX_MOVE, Number(dir[2] ?? DEFAULT_MOVE));
        const name = dir[1].toLowerCase();
        dx = name === "left" ? -d : name === "right" ? d : 0;
        dy = name === "up" ? -d : name === "down" ? d : 0;
      } else { fail(line, "expected left, right, up, down (with an optional distance) or `dx, dy`"); continue; }
      dx = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dx));
      dy = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, dy));
      const moved = shift(node.id, dx, dy);
      applied.push(`moved ${node.name} by ${Math.round(moved.dx)}, ${Math.round(moved.dy)}${limitNote(moved)}`);
    } else if (command === "align") {
      const m = rest.match(/^(.+?)\s+with\s+(.+?):\s*(x|y)$/i);
      if (!m) { fail(line, "expected `align <Node> with <Other>: x|y`"); continue; }
      const a = nodeOrFail(line, m[1]);
      const b = nodeOrFail(line, m[2]);
      if (!a || !b) continue;
      const ca = centres.get(a.id);
      const cb = centres.get(b.id);
      if (!ca || !cb) { fail(line, "the canvas has not placed both nodes yet"); continue; }
      const axis = m[3].toLowerCase();
      const moved = shift(a.id, axis === "x" ? cb.x - ca.x : 0, axis === "y" ? cb.y - ca.y : 0);
      applied.push(`aligned ${a.name} with ${b.name} on ${axis}${limitNote(moved)}`);
    } else if (command === "sides") {
      const m = rest.match(/^(.+?):\s*(\w+)\s*[, ]\s*(\w+)$/);
      if (!m) { fail(line, "expected `sides <A> > <B>: <from side>, <to side>`"); continue; }
      const pair = pairOrFail(line, m[1]);
      if (!pair) continue;
      const from = m[2].toLowerCase() as ConnectionHandle;
      const to = m[3].toLowerCase() as ConnectionHandle;
      if (!SIDES.has(from) || !SIDES.has(to)) { fail(line, "sides are top, right, bottom or left"); continue; }
      if (!parsed.edges.some((e) => e.from === pair.a.id && e.to === pair.b.id)) { fail(line, `there is no connection ${pair.a.name} > ${pair.b.name}`); continue; }
      edgeSides.set(`${pair.a.id}>${pair.b.id}`, { from, to });
      applied.push(`${pair.a.name} > ${pair.b.name} now leaves ${from} and enters ${to}`);
    } else if (command === "label") {
      const m = rest.match(/^(.+?):\s*(.*)$/);
      if (!m) { fail(line, "expected `label <A> > <B>: text`"); continue; }
      const pair = pairOrFail(line, m[1]);
      if (!pair) continue;
      const matches = parsed.edges.filter((e) => e.from === pair.a.id && e.to === pair.b.id);
      if (matches.length === 0) { fail(line, `there is no connection ${pair.a.name} > ${pair.b.name}`); continue; }
      const label = m[2].trim().replace(/"/g, "'") || undefined;
      parsed = { ...parsed, edges: parsed.edges.map((e) => (matches.includes(e) ? { ...e, label } : e)) };
      structural = true;
      applied.push(label ? `labelled ${pair.a.name} > ${pair.b.name} "${label}"` : `removed the label of ${pair.a.name} > ${pair.b.name}`);
    } else if (command === "remove") {
      const pair = splitPair(rest);
      if (pair) {
        const found = pairOrFail(line, rest);
        if (!found) continue;
        const before = parsed.edges.length;
        parsed = { ...parsed, edges: parsed.edges.filter((e) => !(e.from === found.a.id && e.to === found.b.id)) };
        if (parsed.edges.length === before) { fail(line, `there is no connection ${found.a.name} > ${found.b.name}`); continue; }
        edgeSides.delete(`${found.a.id}>${found.b.id}`);
        applied.push(`removed ${found.a.name} > ${found.b.name}`);
      } else {
        const node = nodeOrFail(line, rest);
        if (!node) continue;
        parsed = {
          ...parsed,
          nodes: parsed.nodes.filter((n) => n.id !== node.id),
          edges: parsed.edges.filter((e) => e.from !== node.id && e.to !== node.id),
          groups: parsed.groups.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => id !== node.id) })),
        };
        offsets.delete(node.id);
        for (const key of [...edgeSides.keys()]) if (key.split(">").includes(node.id)) edgeSides.delete(key);
        applied.push(`removed ${node.name} and its connections`);
      }
      structural = true;
    } else {
      const pair = splitPair(rest);
      if (pair) {
        const found = pairOrFail(line, rest);
        if (!found) continue;
        edgeSides.delete(`${found.a.id}>${found.b.id}`);
        applied.push(`${found.a.name} > ${found.b.name} goes back to automatic sides`);
      } else {
        const node = nodeOrFail(line, rest);
        if (!node) continue;
        offsets.delete(node.id);
        applied.push(`${node.name} goes back to its automatic place`);
      }
    }
  }
  // Removing or relabelling rewrites the code; moves and sides only change how it is drawn.
  return { state: structural ? stateFromParsed(parsed, offsets, edgeSides) : { ...state, offsets, edgeSides }, applied, errors };
};

/** The nodes the agent has moved by hand and by how much, so it can see (and undo) its own displacement. */
export const describeMoved = (state: BuilderState): string[] => {
  const name = new Map(state.parsed.nodes.map((n) => [n.id, n.name]));
  return [...state.offsets]
    .filter(([id, o]) => name.has(id) && (Math.abs(o.dx) >= 1 || Math.abs(o.dy) >= 1))
    .map(([id, o]) => `${name.get(id)} (${o.dx >= 0 ? "+" : ""}${Math.round(o.dx)}, ${o.dy >= 0 ? "+" : ""}${Math.round(o.dy)})`);
};

/**
 * How the diagram reads, in one line: the longest path from an entry point, and where it branches.
 * A real description of the structure, so what the agent shows about its own work is not decoration.
 */
export const describeFlow = (state: BuilderState): string => {
  const { nodes, edges } = state.parsed;
  if (nodes.length === 0) return "";
  const name = new Map(nodes.map((n) => [n.id, n.name]));
  const next = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    next.get(e.from)?.push(e.to);
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }
  const best: string[] = [];
  const walk = (id: string, path: string[]) => {
    if (path.length > best.length) best.splice(0, best.length, ...path);
    if (path.length > 12) return;
    for (const to of next.get(id) ?? []) if (!path.includes(to)) walk(to, [...path, to]);
  };
  const sources = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  for (const n of sources.length > 0 ? sources : nodes.slice(0, 1)) walk(n.id, [n.id]);
  const shown = best.slice(0, 6).map((id) => name.get(id)).join(" → ");
  const more = best.length > 6 ? ` (+${best.length - 6} more)` : "";
  const branches = nodes.filter((n) => new Set(next.get(n.id)).size > 1).map((n) => n.name);
  return `${shown}${more}${branches.length > 0 ? `; it branches at ${branches.slice(0, 3).join(", ")}${branches.length > 3 ? "…" : ""}` : ""}`;
};

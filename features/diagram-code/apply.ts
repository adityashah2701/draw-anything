import { parseAnchorSide, buildAnchorId } from "@/core/anchors/generate-anchors";
import type { NodePin } from "@/features/ai/server/layout/pins";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { compileDiagramCode } from "./language/compile";
import type { Diagnostic } from "./language/diagnostics";
import { membersOf } from "./language/ir";
import { serializeDiagramCodeDetailed } from "./serialize";
import type { DiagramCodeIssue } from "./types";

/**
 * Keeping the code and the canvas in step.
 *
 * The canvas is the document; the code is a view of it (see the design doc). The two directions are
 * explicit: `loadFromCanvas` writes the code, `planApply` turns edited code into a *patch* of the
 * elements the code owns. Nothing here touches the board: it returns plain data for the editor to
 * apply as one undo step.
 *
 * Identity. Every element the code owns has a *match key* built from the language's own identities
 * (`node:<id>`, `edge:<from>><to>#<n>`, ...), recorded in `SyncState.owned`. A new compile is matched
 * to the board by those keys, so an unchanged declaration keeps its element (same id, selection,
 * comments, anything the code does not control) and only real differences are written.
 *
 * Conflicts. `SyncState.baseline` is what the code last produced. For every field the code controls,
 * the canvas value, the baseline and the new code value are compared three ways: a field only the
 * user changed is kept, a field only the code changed is updated, a field both changed differently is
 * reported as a conflict and nothing is written until the person picks a side.
 */

export interface SyncState {
  /** The code as of the last sync (loaded or applied). */
  code: string;
  /** Canvas element id to the match key of the declaration it was drawn for. */
  owned: Record<string, string>;
  /** What the code produced at the last sync, by match key. */
  baseline: Record<string, DrawingElement>;
}

export interface Conflict {
  elementId: string;
  /** Which declaration: `node:orders`, `edge:a>b#1`, ... */
  key: string;
  /** The field, e.g. `label`, `fill`, `ai.icon`. */
  field: string;
  canvas: unknown;
  code: unknown;
}

export interface ApplyPatch {
  add: DrawingElement[];
  /** Whole elements to write; the ids are those already on the board. */
  update: DrawingElement[];
  remove: string[];
}

export interface ApplyPlan {
  patch: ApplyPatch;
  /** The sync state to keep once the patch is applied. */
  sync: SyncState;
  /** The new elements are already in their final place (code gave every position, or the diagram was updated in place). */
  anchored: boolean;
  summary: { added: number; updated: number; removed: number; unchanged: number; restored: number };
  /** Warnings from the code; never errors. */
  issues: DiagramCodeIssue[];
}

export type ApplyOutcome =
  /** The code cannot be drawn: the canvas is left exactly as it is. */
  | { status: "invalid"; diagnostics: DiagramCodeIssue[] }
  /** Both sides changed the same field; nothing is written until `resolve` is given. */
  | { status: "conflict"; conflicts: Conflict[] }
  | { status: "ready"; plan: ApplyPlan };

export interface ApplyInput {
  code: string;
  /** Every element on the board. */
  canvas: readonly DrawingElement[];
  /** Absent for a diagram the code has not drawn yet. */
  sync?: SyncState | null;
  /** How to settle fields changed on both sides. */
  resolve?: "code" | "canvas";
  /** Used for the ids of a new diagram; an update keeps the generation it already has. */
  generationId: string;
  frameId?: string;
}

// ── keys ────────────────────────────────────────────────────────────────────

const isArrow = (el: DrawingElement) => el.type === "arrow" || el.type === "arrow-bidirectional";

type Connected = DrawingElement & { startConnection?: { elementId: string; anchorId?: string }; endConnection?: { elementId: string; anchorId?: string } };

/** Match keys for freshly compiled elements, whose `ai.semanticId`s are the language's ids. */
const keysOfFresh = (elements: readonly DrawingElement[]): Map<string, string> => {
  const keys = new Map<string, string>();
  const nodeKey = new Map<string, string>();
  for (const el of elements) {
    const role = el.ai?.role;
    if (role === "node") {
      keys.set(el.id, `node:${el.ai!.semanticId}`);
      nodeKey.set(el.id, el.ai!.semanticId!);
    } else if (role === "group") keys.set(el.id, `group:${el.ai!.semanticId}`);
    else if (role === "group-label") keys.set(el.id, `group-label:${el.ai!.semanticId}`);
  }
  const seen = new Map<string, number>();
  const arrowKey = new Map<string, string>();
  for (const el of elements) {
    if (!isArrow(el)) continue;
    const arrow = el as Connected;
    const from = arrow.startConnection && nodeKey.get(arrow.startConnection.elementId);
    const to = arrow.endConnection && nodeKey.get(arrow.endConnection.elementId);
    if (!from || !to) continue;
    const pair = `${from}>${to}`;
    const n = (seen.get(pair) ?? 0) + 1;
    seen.set(pair, n);
    const key = `edge:${pair}#${n}`;
    keys.set(el.id, key);
    arrowKey.set(el.ai?.semanticId ?? el.id, key);
  }
  for (const el of elements) {
    if (el.ai?.role !== "edge-label") continue;
    const owner = [...arrowKey.keys()].find((id) => `${id}-label` === el.ai!.semanticId);
    if (owner) keys.set(el.id, `${arrowKey.get(owner)!}~label`);
  }
  return keys;
};

// ── field comparison ────────────────────────────────────────────────────────

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!same(left[key], right[key])) return false;
  }
  return true;
};

/** Fields the layout and router derive from the rest; they always follow the new compile. */
const DERIVED = new Set(["id", "points", "startConnection", "endConnection", "routePreference", "isManuallyRouted"]);

const fieldsOf = (el: DrawingElement | undefined): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!el) return out;
  for (const [key, value] of Object.entries(el as unknown as Record<string, unknown>)) {
    if (DERIVED.has(key)) continue;
    if (key === "ai" && value && typeof value === "object") {
      for (const [sub, v] of Object.entries(value as Record<string, unknown>)) out[`ai.${sub}`] = v;
    } else out[key] = value;
  }
  return out;
};

const setField = (target: Record<string, unknown>, field: string, value: unknown) => {
  if (field.startsWith("ai.")) {
    const ai = { ...((target.ai as Record<string, unknown>) ?? {}) };
    if (value === undefined) delete ai[field.slice(3)];
    else ai[field.slice(3)] = value;
    target.ai = ai;
  } else target[field] = value;
};

interface Merged {
  element: DrawingElement;
  changed: boolean;
  conflicts: Conflict[];
}

/** Three-way merge of one element; see the header for the rules. */
const mergeElement = (
  key: string,
  current: DrawingElement,
  fresh: DrawingElement,
  base: DrawingElement | undefined,
  resolve: ApplyInput["resolve"],
): Merged => {
  const cur = fieldsOf(current);
  const next = fieldsOf(fresh);
  const was = fieldsOf(base);
  const out: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
  const conflicts: Conflict[] = [];
  let changed = false;

  for (const field of new Set([...Object.keys(next), ...Object.keys(was)])) {
    const n = next[field];
    const c = cur[field];
    if (same(n, c)) continue;
    const b = was[field];
    let take: "code" | "canvas";
    if (!base) take = "code";
    else if (same(n, b)) take = "canvas";
    else if (same(c, b)) take = "code";
    else if (resolve) take = resolve;
    else {
      conflicts.push({ elementId: current.id, key, field, canvas: c, code: n });
      continue;
    }
    if (take === "canvas") continue;
    setField(out, field, n);
    changed = true;
  }

  // Derived geometry follows the new compile. A connector the user routed by hand keeps its path.
  const manual = isArrow(current) && (current as { isManuallyRouted?: boolean }).isManuallyRouted === true;
  const nextPoints = manual ? current.points : fresh.points;
  if (!same(nextPoints, current.points)) {
    out.points = nextPoints;
    changed = true;
  }
  for (const link of ["startConnection", "endConnection"] as const) {
    const wanted = (fresh as Connected)[link];
    if (!same(wanted, (current as Connected)[link])) {
      out[link] = wanted;
      changed = true;
    }
  }
  return { element: out as unknown as DrawingElement, changed, conflicts };
};

// ── geometry helpers ────────────────────────────────────────────────────────

const boundsOf = (points: readonly Point[]) => ({
  minX: Math.min(...points.map((p) => p.x)),
  maxX: Math.max(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y)),
});

const centreOf = (el: DrawingElement): Point => {
  const b = boundsOf(el.points);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const cornerOf = (elements: readonly DrawingElement[]): Point => {
  let x = Infinity;
  let y = Infinity;
  for (const el of elements) for (const p of el.points) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
  }
  return { x, y };
};

const MOVED_BY_PX = 2;

/**
 * Nodes the user has moved by hand since the last sync: their centre differs from the baseline's.
 * Moving the whole diagram is not a manual choice, so the common shift (the median) is removed first.
 */
const movedNodes = (owned: ReadonlyMap<string, DrawingElement>, sync: SyncState): Map<string, NodePin> => {
  const pairs: Array<{ id: string; at: Point; was: Point }> = [];
  for (const [key, el] of owned) {
    if (!key.startsWith("node:")) continue;
    const base = sync.baseline[key];
    if (base) pairs.push({ id: key.slice(5), at: centreOf(el), was: centreOf(base) });
  }
  const dx = median(pairs.map((p) => p.at.x - p.was.x));
  const dy = median(pairs.map((p) => p.at.y - p.was.y));
  const pins = new Map<string, NodePin>();
  for (const p of pairs) {
    if (Math.hypot(p.at.x - p.was.x - dx, p.at.y - p.was.y - dy) > MOVED_BY_PX) pins.set(p.id, { ...p.at });
  }
  return pins;
};

const translate = (el: DrawingElement, dx: number, dy: number): DrawingElement =>
  dx === 0 && dy === 0 ? el : ({ ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } as DrawingElement);

const asIssues = (diagnostics: readonly Diagnostic[]): DiagramCodeIssue[] => diagnostics.map((d) => ({ ...d }));

// ── code to canvas ──────────────────────────────────────────────────────────

const generationOf = (sync: SyncState | null | undefined, fallback: string): string => {
  const first = sync ? Object.values(sync.baseline).find((el) => el.ai?.generationId) : undefined;
  return first?.ai?.generationId ?? fallback;
};

/**
 * Plan the board change that makes the canvas match `code`. Pure: the canvas is read, never written.
 * Invalid code (any error, or nothing to draw) yields `invalid` and the canvas keeps its last valid state.
 */
export const planApply = (input: ApplyInput): ApplyOutcome => {
  const { code, canvas, sync, resolve, frameId = "diagram-code" } = input;
  const compiled = compileDiagramCode(code);
  const blocking = compiled.diagnostics.filter((d) => d.severity === "error");
  if (blocking.length > 0) return { status: "invalid", diagnostics: asIssues(blocking) };
  if (compiled.ir.nodes.length === 0) {
    return { status: "invalid", diagnostics: [{ line: 1, severity: "error", code: "limit/size", message: "There is nothing to draw yet: add at least one node." }] };
  }

  const byId = new Map(canvas.map((el) => [el.id, el]));
  const owned = new Map<string, DrawingElement>(); // key -> element on the board
  const ownedKeyOf = new Map<string, string>(); // element id -> key
  if (sync) {
    for (const [id, key] of Object.entries(sync.owned)) {
      const el = byId.get(id);
      if (el) {
        owned.set(key, el);
        ownedKeyOf.set(id, key);
      }
    }
  }

  const pins = sync && owned.size > 0 ? movedNodes(owned, sync) : undefined;
  const generationId = generationOf(sync, input.generationId);
  const drawn = elementsFromDiagramCode(code, { generationId, frameId, pins });
  if (drawn.elements.length === 0) {
    return { status: "invalid", diagnostics: drawn.issues.filter((i) => i.severity === "error") };
  }
  const issues = [...drawn.issues].filter((i) => i.severity !== "error");

  // Updating in place keeps the diagram where it is; code that gives every position is already placed.
  const allPlaced = compiled.ir.nodes.every((n) => n.x !== undefined && n.y !== undefined);
  const anchored = allPlaced || Boolean(pins && pins.size > 0);
  let fresh = drawn.elements;
  if (owned.size > 0 && !anchored) {
    const from = cornerOf(fresh);
    const to = cornerOf([...owned.values()]);
    if (Number.isFinite(from.x) && Number.isFinite(to.x)) fresh = fresh.map((el) => translate(el, to.x - from.x, to.y - from.y));
  }

  const freshKeys = keysOfFresh(fresh);
  // Fresh element id -> id it will have on the board.
  const idMap = new Map<string, string>();
  for (const el of fresh) {
    const key = freshKeys.get(el.id);
    const existing = key ? owned.get(key) : undefined;
    idMap.set(el.id, existing ? existing.id : el.id);
  }
  const remap = (el: DrawingElement): DrawingElement => {
    const copy = { ...el, id: idMap.get(el.id) ?? el.id } as Connected;
    for (const link of ["startConnection", "endConnection"] as const) {
      const c = copy[link];
      if (!c) continue;
      const elementId = idMap.get(c.elementId) ?? c.elementId;
      const side = c.anchorId ? parseAnchorSide(c.anchorId) : null;
      copy[link] = { ...c, elementId, ...(side ? { anchorId: buildAnchorId(elementId, side) } : {}) };
    }
    return copy as DrawingElement;
  };

  const patch: ApplyPatch = { add: [], update: [], remove: [] };
  const conflicts: Conflict[] = [];
  const newOwned: Record<string, string> = {};
  const newBaseline: Record<string, DrawingElement> = {};
  let unchanged = 0;
  let restored = 0;

  for (const el of fresh) {
    const key = freshKeys.get(el.id);
    const wanted = remap(el);
    if (key) newBaseline[key] = wanted;
    const current = key ? owned.get(key) : undefined;
    if (!key || !current) {
      patch.add.push(wanted);
      if (key && sync?.baseline[key]) restored += 1; // it was drawn before and is gone from the board
      newOwned[wanted.id] = key ?? `orphan:${wanted.id}`;
      continue;
    }
    newOwned[current.id] = key;
    const merged = mergeElement(key, current, wanted, sync?.baseline[key], resolve);
    conflicts.push(...merged.conflicts);
    if (merged.changed) patch.update.push(merged.element);
    else unchanged += 1;
  }

  // A declaration that was deleted from the code: its element goes. (Ones already gone from the board need nothing.)
  for (const el of owned.values()) if (!(el.id in newOwned)) patch.remove.push(el.id);

  if (conflicts.length > 0) return { status: "conflict", conflicts };

  return {
    status: "ready",
    plan: {
      patch,
      sync: { code, owned: newOwned, baseline: newBaseline },
      anchored: anchored || owned.size > 0,
      summary: { added: patch.add.length - restored, updated: patch.update.length, removed: patch.remove.length, unchanged, restored },
      issues,
    },
  };
};

// ── canvas to code ──────────────────────────────────────────────────────────

export interface LoadResult {
  code: string;
  sync: SyncState;
  nodeCount: number;
  edgeCount: number;
}

/**
 * Read the diagram off the canvas as code, and remember which element each declaration came from so
 * that applying edits later updates those elements instead of replacing them.
 * Returns null when there is nothing to convert.
 */
export const loadFromCanvas = (
  elements: readonly DrawingElement[],
  { selectedIds = [], layout = true, generationId }: { selectedIds?: readonly string[]; layout?: boolean; generationId: string },
): LoadResult | null => {
  const scope = selectedIds.length > 0 ? elements.filter((el) => selectedIds.includes(el.id)) : [...elements];
  const { graph, consumedIds, provenance } = graphFromElements(scope, { layout });
  if (graph.nodes.length === 0) return null;

  const { code, names } = serializeDiagramCodeDetailed(graph);
  const compiled = compileDiagramCode(code);
  const baselineDraw = elementsFromDiagramCode(code, { generationId, frameId: "diagram-code" });
  const baselineKeys = keysOfFresh(baselineDraw.elements);
  const baseline: Record<string, DrawingElement> = {};
  for (const el of baselineDraw.elements) {
    const key = baselineKeys.get(el.id);
    if (key) baseline[key] = el;
  }

  const owned: Record<string, string> = {};
  const irIdOfGraphNode = new Map<string, string>();
  for (const [graphId, name] of names) {
    const node = compiled.ir.nodes.find((n) => n.name === name);
    if (node) irIdOfGraphNode.set(graphId, node.id);
  }
  for (const [graphId, elementId] of provenance.nodes) {
    const irId = irIdOfGraphNode.get(graphId);
    if (irId) owned[elementId] = `node:${irId}`;
  }

  // Edges were written in graph order, one line each, so the n-th graph edge is the n-th edge of the code.
  const known = new Set(irIdOfGraphNode.keys());
  const written = graph.edges.map((edge, i) => ({ edge, source: provenance.edges[i] })).filter(({ edge }) => known.has(edge.from) && known.has(edge.to));
  if (written.length === compiled.ir.edges.length) {
    const seen = new Map<string, number>();
    written.forEach(({ source }, i) => {
      const e = compiled.ir.edges[i];
      const pair = `${e.from}>${e.to}`;
      const n = (seen.get(pair) ?? 0) + 1;
      seen.set(pair, n);
      owned[source.arrowId] = `edge:${pair}#${n}`;
      if (source.labelId) owned[source.labelId] = `edge:${pair}#${n}~label`;
    });
  }

  // A group is recognised by its members, which the serializer keeps unique.
  const irGroupByMembers = new Map(compiled.ir.groups.map((g) => [membersOf(compiled.ir, { type: "group", id: g.id }).sort().join("|"), g.id]));
  graph.groups.forEach((group, i) => {
    const source = provenance.groups[i];
    const members = group.nodeIds.map((id) => irIdOfGraphNode.get(id)).filter((id): id is string => id !== undefined).sort().join("|");
    const irId = irGroupByMembers.get(members);
    if (!irId || !source) return;
    owned[source.frameId] = `group:${irId}`;
    if (source.titleId) owned[source.titleId] = `group-label:${irId}`;
  });

  // Anything the diagram consumed that no declaration claims is removed on the next update, as before.
  for (const id of consumedIds) if (!(id in owned)) owned[id] = `orphan:${id}`;

  return { code, sync: { code, owned, baseline }, nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
};

// ── drift ───────────────────────────────────────────────────────────────────

export interface Drift {
  /** Elements whose code-controlled fields differ from what the code produced (edited on the canvas). */
  edited: string[];
  /** Elements the code drew that are no longer on the board. */
  missing: string[];
}

/** What changed on the canvas since the code was last synced; empty when the two still agree. */
export const canvasDrift = (canvas: readonly DrawingElement[], sync: SyncState): Drift => {
  const byId = new Map(canvas.map((el) => [el.id, el]));
  const drift: Drift = { edited: [], missing: [] };
  for (const [id, key] of Object.entries(sync.owned)) {
    const el = byId.get(id);
    const base = sync.baseline[key];
    if (!el) {
      drift.missing.push(id);
      continue;
    }
    if (!base) continue;
    const now = fieldsOf(el);
    const was = fieldsOf(base);
    // Only fields the code sets can be "edited"; fields the user added are theirs.
    if (Object.keys(was).some((field) => !same(now[field], was[field]))) drift.edited.push(id);
  }
  return drift;
};

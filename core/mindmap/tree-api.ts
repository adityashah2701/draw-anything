import { buildAnchorId } from "@/core/anchors/anchor-geometry";
import type { DocPatch } from "@/core/groups/patch";
import { mindmapSize } from "@/core/shapes/mindmap-node/definition";
import type { DrawingElement, MindmapNodeShape, MindmapRole, StoredElement } from "@/core/model";

/**
 * The mind-map tree as a pure API over the stored list: add a topic, add a sibling, collapse and expand, move a branch,
 * delete a subtree. Each returns one `DocPatch` (one undo step). A topic names its parent (`parentId`); its branch is a
 * curved connector to the parent (`ai.role: "branch"`), so collapse is the existing hide and routing is the existing router.
 */
export const BRANCH_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#dc2626", "#ca8a04", "#db2777"] as const;
const GAP_X = 90;
const GAP_Y = 24;

export type MindmapFailure = { ok: false; code: "not_found" | "invalid"; message: string };
export type MindmapResult = { ok: true; patch: DocPatch; id?: string } | MindmapFailure;
const fail = (code: MindmapFailure["code"], message: string): MindmapFailure => ({ ok: false, code, message });

const nodesOf = (stored: readonly StoredElement[]) => stored.filter((e): e is MindmapNodeShape => e.type === "mindmap-node");
const byId = (stored: readonly StoredElement[]) => new Map(nodesOf(stored).map((n) => [n.id, n]));

export const branchIdOf = (nodeId: string) => `${nodeId}-branch`;

export const childrenOf = (stored: readonly StoredElement[], id: string): MindmapNodeShape[] => nodesOf(stored).filter((n) => n.parentId === id);

/** Every topic below `id`, at any depth, nearest first. */
export const descendantsOf = (stored: readonly StoredElement[], id: string): MindmapNodeShape[] => {
  const out: MindmapNodeShape[] = [];
  const seen = new Set([id]);
  let layer = [id];
  while (layer.length) {
    const next = nodesOf(stored).filter((n) => n.parentId !== undefined && layer.includes(n.parentId) && !seen.has(n.id));
    next.forEach((n) => seen.add(n.id));
    out.push(...next);
    layer = next.map((n) => n.id);
  }
  return out;
};

const roleFor = (parent: MindmapNodeShape): MindmapRole => (parent.role === "central" ? "main" : parent.role === "main" ? "sub" : "leaf");

/** The colour a branch takes: a main branch picks the next of the palette; everything below inherits its parent's. */
export const colorFor = (stored: readonly StoredElement[], parent: MindmapNodeShape): string => {
  if (parent.role === "central") return BRANCH_COLORS[childrenOf(stored, parent.id).length % BRANCH_COLORS.length];
  return parent.branchColor ?? BRANCH_COLORS[0];
};

const branchFor = (parent: MindmapNodeShape, child: MindmapNodeShape, color: string): DrawingElement =>
  ({
    id: branchIdOf(child.id), type: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color, strokeWidth: child.role === "main" ? 3 : 2, arrowHeadEnd: false, arrowHeadStart: false, routingMode: "curved", isManuallyRouted: false,
    startConnection: { elementId: parent.id, anchorId: buildAnchorId(parent.id, "right") },
    endConnection: { elementId: child.id, anchorId: buildAnchorId(child.id, "left") },
    ai: { role: "branch", semanticId: branchIdOf(child.id) },
  }) as DrawingElement;

/** A new topic under `parentId`: placed to the right of it and below its last child, with its branch. */
export const addChild = (stored: readonly StoredElement[], parentId: string, id: string, label = "Topic"): MindmapResult => {
  const parent = byId(stored).get(parentId);
  if (!parent) return fail("not_found", `"${parentId}" is not a topic.`);
  if (stored.some((e) => e.id === id)) return fail("invalid", `"${id}" is already used.`);
  const siblings = childrenOf(stored, parentId);
  const role = roleFor(parent);
  const size = mindmapSize({ role, label });
  const px = Math.max(parent.points[0].x, parent.points[1].x), py = Math.min(parent.points[0].y, parent.points[1].y);
  const last = siblings[siblings.length - 1];
  const y = last ? Math.max(last.points[0].y, last.points[1].y) + GAP_Y : py;
  const color = colorFor(stored, parent);
  const child: MindmapNodeShape = { id, type: "mindmap-node", label, role, parentId, branchColor: color, color: "#000000", strokeWidth: 2, points: [{ x: px + GAP_X, y }, { x: px + GAP_X + size.width, y: y + size.height }] };
  return { ok: true, id, patch: { add: [child as StoredElement, branchFor(parent, child, color) as StoredElement], update: [], remove: [] } };
};

/** A new topic beside `id`: another child of its parent. The central topic has no sibling. */
export const addSibling = (stored: readonly StoredElement[], id: string, newId: string, label?: string): MindmapResult => {
  const node = byId(stored).get(id);
  if (!node) return fail("not_found", `"${id}" is not a topic.`);
  if (!node.parentId) return fail("invalid", "The central topic has no sibling; add a topic under it instead.");
  return addChild(stored, node.parentId, newId, label);
};

/** Collapse hides everything below a topic (and their branches); expand shows them again, except below a topic that is itself collapsed. */
export const setCollapsed = (stored: readonly StoredElement[], id: string, collapsed: boolean): MindmapResult => {
  const node = byId(stored).get(id);
  if (!node) return fail("not_found", `"${id}" is not a topic.`);
  const all = byId(stored);
  const hiddenBy = (n: MindmapNodeShape): boolean => {
    for (let p = n.parentId ? all.get(n.parentId) : undefined, guard = 0; p && guard < 100; p = p.parentId ? all.get(p.parentId) : undefined, guard += 1) if (p.id === id ? collapsed : p.collapsed) return true;
    return false;
  };
  const update: StoredElement[] = [{ ...node, collapsed: collapsed ? true : undefined } as StoredElement];
  for (const d of descendantsOf(stored, id)) {
    const hidden = hiddenBy(d) ? true : undefined;
    update.push({ ...d, hidden } as StoredElement);
    const branch = stored.find((e) => e.id === branchIdOf(d.id));
    if (branch) update.push({ ...branch, hidden } as StoredElement);
  }
  return { ok: true, patch: { add: [], update, remove: [] } };
};

/** Deletes a topic and everything below it, with their branches. */
export const deleteTopic = (stored: readonly StoredElement[], id: string): MindmapResult => {
  const node = byId(stored).get(id);
  if (!node) return fail("not_found", `"${id}" is not a topic.`);
  const doomed = [node, ...descendantsOf(stored, id)].map((n) => n.id);
  const remove = [...doomed, ...doomed.map(branchIdOf).filter((b) => stored.some((e) => e.id === b))];
  return { ok: true, patch: { add: [], update: [], remove } };
};

/** Moves a topic (with its subtree) under another; refuses a move under itself or its own descendant. */
export const reparent = (stored: readonly StoredElement[], id: string, parentId: string): MindmapResult => {
  const all = byId(stored);
  const node = all.get(id), parent = all.get(parentId);
  if (!node || !parent) return fail("not_found", "Both must be topics.");
  if (!node.parentId) return fail("invalid", "The central topic cannot be moved under another.");
  if (id === parentId || descendantsOf(stored, id).some((d) => d.id === parentId)) return fail("invalid", "A topic cannot move under itself or one of its own subtopics.");
  const color = colorFor(stored, parent);
  const role = roleFor(parent);
  const update: StoredElement[] = [{ ...node, parentId, role, branchColor: color } as StoredElement];
  const retint = (n: MindmapNodeShape, r: MindmapRole) => {
    for (const c of childrenOf(stored, n.id)) {
      const nr: MindmapRole = r === "main" ? "sub" : "leaf";
      update.push({ ...c, role: nr, branchColor: color } as StoredElement);
      retint(c, nr);
    }
  };
  retint(node, role);
  const branch = stored.find((e) => e.id === branchIdOf(id)) as DrawingElement | undefined;
  if (branch) update.push({ ...branch, color, startConnection: { elementId: parentId, anchorId: buildAnchorId(parentId, "right") } } as StoredElement);
  for (const d of descendantsOf(stored, id)) {
    const b = stored.find((e) => e.id === branchIdOf(d.id));
    if (b) update.push({ ...b, color } as StoredElement);
  }
  return { ok: true, patch: { add: [], update, remove: [] } };
};

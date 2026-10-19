import type { DrawingElement, GroupRecord, StoredElement } from "@/features/whiteboard/types/whiteboard.types";

/** True for a stored composite-group record (never for a drawable shape). */
export const isGroupRecord = (value: unknown): value is GroupRecord =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "group" &&
  typeof (value as { id?: unknown }).id === "string";

/** The stored list split into what the canvas draws and the group records that describe how it nests. */
export const splitStored = (stored: readonly StoredElement[]): { shapes: DrawingElement[]; records: GroupRecord[] } => {
  const shapes: DrawingElement[] = [];
  const records: GroupRecord[] = [];
  for (const item of stored) {
    if (!item || typeof item !== "object") continue;
    if (isGroupRecord(item)) records.push(item);
    else shapes.push(item as DrawingElement);
  }
  return { shapes, records };
};

/**
 * Read-only view of how the stored list nests. It is rebuilt from the list on every change and
 * *repairs virtually*: a dangling `groupId`, a cycle, a duplicate id or an empty group never throws
 * and never needs a write, it is simply ignored. That matters because the list is shared: another
 * client, an older build or a half-applied AI edit can leave such data behind.
 */
export interface GroupIndex {
  /** Valid groups only: acyclic and holding at least one shape. */
  readonly groups: ReadonlyMap<string, GroupRecord>;
  /** Drawable shapes by id. */
  readonly shapes: ReadonlyMap<string, DrawingElement>;
  /** Child (shape or group) -> its group. Absent = top level. */
  readonly parentOf: ReadonlyMap<string, string>;
  /** Group -> direct children (shapes and groups) in stacking order of their first shape. */
  readonly childrenOf: ReadonlyMap<string, readonly string[]>;
  /** Group -> every shape inside it at any depth, in stacking order. */
  readonly leavesOf: ReadonlyMap<string, readonly string[]>;
  /** Stacking position of each shape (index among the shapes). */
  readonly order: ReadonlyMap<string, number>;
}

const EMPTY: GroupIndex = {
  groups: new Map(),
  shapes: new Map(),
  parentOf: new Map(),
  childrenOf: new Map(),
  leavesOf: new Map(),
  order: new Map(),
};

export const buildGroupIndex = (stored: readonly StoredElement[]): GroupIndex => {
  if (stored.length === 0) return EMPTY;

  const shapes = new Map<string, DrawingElement>();
  const records = new Map<string, GroupRecord>();
  const order = new Map<string, number>();
  for (const item of stored) {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") continue;
    if (isGroupRecord(item)) {
      if (!records.has(item.id)) records.set(item.id, item);
    } else if (!shapes.has(item.id)) {
      order.set(item.id, shapes.size);
      shapes.set(item.id, item as DrawingElement);
    }
  }
  // An id used by a shape wins over a group record with the same id: shapes are what the user sees.
  for (const id of shapes.keys()) records.delete(id);

  const linkOf = (item: { id: string; groupId?: unknown }) =>
    typeof item.groupId === "string" && item.groupId !== item.id && records.has(item.groupId) ? item.groupId : undefined;

  const parentOf = new Map<string, string>();
  for (const [id, record] of records) {
    const parent = linkOf(record);
    if (parent) parentOf.set(id, parent);
  }
  // Cut cycles (A in B in A). Walking from each group, the first link that closes a loop is dropped.
  for (const start of records.keys()) {
    const seen = new Set<string>();
    let current = start;
    while (parentOf.has(current)) {
      if (seen.has(current)) {
        parentOf.delete(current);
        break;
      }
      seen.add(current);
      current = parentOf.get(current)!;
    }
  }
  for (const [id, shape] of shapes) {
    const parent = linkOf(shape);
    if (parent) parentOf.set(id, parent);
  }

  // Each shape, in stacking order, registers itself with every ancestor: lists come out ordered.
  const leaves = new Map<string, string[]>();
  for (const id of shapes.keys()) {
    let parent = parentOf.get(id);
    while (parent !== undefined) {
      let list = leaves.get(parent);
      if (!list) leaves.set(parent, (list = []));
      list.push(id);
      parent = parentOf.get(parent);
    }
  }

  // Groups without a shape are not groups any more: drop them (and any link that points at them).
  const groups = new Map<string, GroupRecord>();
  for (const [id, record] of records) if (leaves.has(id)) groups.set(id, record);
  for (const id of [...parentOf.keys()]) if (!groups.has(parentOf.get(id)!) || (!shapes.has(id) && !groups.has(id))) parentOf.delete(id);

  const firstLeaf = (id: string) => (shapes.has(id) ? order.get(id)! : order.get(leaves.get(id)![0])!);
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    let list = childrenOf.get(parent);
    if (!list) childrenOf.set(parent, (list = []));
    list.push(child);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => firstLeaf(a) - firstLeaf(b));

  return { groups, shapes, parentOf, childrenOf, leavesOf: leaves, order };
};

export const isGroupId = (index: GroupIndex, id: string) => index.groups.has(id);

/** Enclosing groups of `id`, nearest first. */
export const ancestorsOf = (index: GroupIndex, id: string): string[] => {
  const out: string[] = [];
  let parent = index.parentOf.get(id);
  while (parent !== undefined) {
    out.push(parent);
    parent = index.parentOf.get(parent);
  }
  return out;
};

/** The outermost group containing `id`, or `id` itself when it is at the top level. */
export const rootOf = (index: GroupIndex, id: string): string => {
  let current = id;
  for (let parent = index.parentOf.get(current); parent !== undefined; parent = index.parentOf.get(current)) current = parent;
  return current;
};

/** Shapes a selection unit stands for: the shape itself, or every shape inside a group. */
export const leavesOfUnit = (index: GroupIndex, unitId: string): readonly string[] =>
  index.groups.has(unitId) ? index.leavesOf.get(unitId)! : index.shapes.has(unitId) ? [unitId] : [];

/**
 * The thing a click on `id` should select while `context` is the group the user has entered (null =
 * top level): `id` itself or the ancestor that is a *direct child* of `context`. Null when `id` is
 * not inside `context`.
 */
export const unitUnder = (index: GroupIndex, id: string, context: string | null): string | null => {
  let current = id;
  for (;;) {
    const parent = index.parentOf.get(current);
    if (parent === (context ?? undefined)) return current;
    if (parent === undefined) return null;
    current = parent;
  }
};

/** A shape is locked when it, or any group around it, is. */
export const isEffectivelyLocked = (index: GroupIndex, id: string): boolean => {
  const own = index.shapes.get(id)?.locked ?? index.groups.get(id)?.locked;
  if (own) return true;
  return ancestorsOf(index, id).some((ancestor) => index.groups.get(ancestor)?.locked === true);
};

/** Selected shape ids with unknown ids and repeats removed, keeping the caller's order. */
export const selectedShapeIds = (index: GroupIndex, selected: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of selected) {
    if (!seen.has(id) && index.shapes.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
};

/**
 * The selection as the user perceives it: maximal fully-selected subtrees. A group whose every shape
 * is selected counts as one unit (and as part of a bigger one when its own parent is fully selected).
 */
export const selectionUnits = (index: GroupIndex, selected: readonly string[]): string[] => {
  const ids = selectedShapeIds(index, selected);
  const set = new Set(ids);
  const full = new Map<string, boolean>();
  const isFull = (group: string) => {
    let value = full.get(group);
    if (value === undefined) {
      value = index.leavesOf.get(group)!.every((leaf) => set.has(leaf));
      full.set(group, value);
    }
    return value;
  };
  const seen = new Set<string>();
  const units: string[] = [];
  for (const id of ids) {
    let unit = id;
    for (let parent = index.parentOf.get(unit); parent !== undefined && isFull(parent); parent = index.parentOf.get(unit)) unit = parent;
    if (!seen.has(unit)) {
      seen.add(unit);
      units.push(unit);
    }
  }
  return units;
};

/** Every shape the given units stand for, each once, in stacking order. */
export const expandUnits = (index: GroupIndex, units: readonly string[]): string[] => {
  const out = new Set<string>();
  for (const unit of units) for (const leaf of leavesOfUnit(index, unit)) out.add(leaf);
  return [...out].sort((a, b) => index.order.get(a)! - index.order.get(b)!);
};

/** The group a set of units should be nested in when grouped together: their deepest common parent. */
export const commonParent = (index: GroupIndex, units: readonly string[]): string | null => {
  if (units.length === 0) return null;
  let common: string[] | null = null;
  for (const unit of units) {
    const chain = ancestorsOf(index, unit).reverse(); // outermost first
    if (common === null) common = chain;
    else {
      let n = 0;
      while (n < common.length && n < chain.length && common[n] === chain[n]) n += 1;
      common = common.slice(0, n);
    }
  }
  return common && common.length > 0 ? common[common.length - 1] : null;
};

/** Display name for a group. */
export const groupLabel = (record: GroupRecord) => (record.name?.trim() ? record.name.trim() : "Group");

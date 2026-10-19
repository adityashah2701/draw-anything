import type { DrawingElement, GroupRecord, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  ancestorsOf,
  buildGroupIndex,
  commonParent,
  expandUnits,
  isEffectivelyLocked,
  isGroupRecord,
  selectionUnits,
  splitStored,
  type GroupIndex,
} from "./group-index";
import { applyPatch, emptyPatch, isEmptyPatch, type DocPatch } from "./patch";

/** Records that hold no shape any more, in a list that has just been changed. */
export const deadGroupIds = (stored: readonly StoredElement[]): string[] => {
  const index = buildGroupIndex(stored);
  return stored.filter(isGroupRecord).filter((record) => !index.groups.has(record.id)).map((record) => record.id);
};

/**
 * Adds the removal of every group the patch leaves empty, so no command (and no delete path) can
 * leave an invisible record behind.
 */
export const withPrunedGroups = (stored: readonly StoredElement[], patch: DocPatch): DocPatch => {
  const dead = deadGroupIds(applyPatch(stored, patch)).filter((id) => !patch.remove.includes(id));
  return dead.length === 0 ? patch : { ...patch, remove: [...patch.remove, ...dead] };
};

const asUpdate = <T extends StoredElement>(element: T, change: Partial<StoredElement>): StoredElement =>
  ({ ...element, ...change }) as StoredElement;

export interface GroupPlan {
  patch: DocPatch;
  groupId: string;
  /** Shapes to leave selected afterwards. */
  selection: string[];
}

/**
 * Group the selected units. Needs two or more movable units. The new group is nested in the deepest
 * group that contained all of them (top level otherwise); a unit that came out of a different group
 * simply leaves it (and that group is removed if it ends up empty). Stacking order is untouched.
 */
export const planGroup = (stored: readonly StoredElement[], selected: readonly string[], newId: () => string): GroupPlan | null => {
  const index = buildGroupIndex(stored);
  const units = selectionUnits(index, selected).filter((unit) => !isEffectivelyLocked(index, unit));
  if (units.length < 2) return null;

  const groupId = newId();
  const parent = commonParent(index, units);
  const record: GroupRecord = {
    id: groupId,
    type: "group",
    points: [],
    color: "#000000",
    strokeWidth: 0,
    ...(parent ? { groupId: parent } : {}),
  };
  const update: StoredElement[] = units.map((unit) => {
    const element = index.shapes.get(unit) ?? index.groups.get(unit)!;
    return asUpdate(element, { groupId });
  });
  const patch = withPrunedGroups(stored, { add: [record], update, remove: [] });
  return { patch, groupId, selection: expandUnits(index, units) };
};

export interface UngroupPlan {
  patch: DocPatch;
  selection: string[];
  /** Groups that were dissolved. */
  groups: string[];
}

/** Dissolve each selected group one level: its children move up into its parent (or the top level). */
export const planUngroup = (stored: readonly StoredElement[], selected: readonly string[]): UngroupPlan | null => {
  const index = buildGroupIndex(stored);
  const groups = selectionUnits(index, selected).filter((unit) => index.groups.has(unit) && !isEffectivelyLocked(index, unit));
  if (groups.length === 0) return null;

  const patch = emptyPatch();
  for (const id of groups) {
    const parent = index.parentOf.get(id);
    for (const child of index.childrenOf.get(id) ?? []) {
      const element = index.shapes.get(child) ?? index.groups.get(child)!;
      patch.update.push(asUpdate(element, { groupId: parent }));
    }
    patch.remove.push(id);
  }
  return { patch: withPrunedGroups(stored, patch), selection: expandUnits(index, groups), groups };
};

/**
 * Lock or unlock the selected units. Locking sets the flag on each unit (a group record or a shape).
 * Unlocking clears it on the unit, on everything inside it and on any locked group around it, so what
 * the user unlocked is really editable afterwards.
 */
export const planSetLocked = (stored: readonly StoredElement[], selected: readonly string[], locked: boolean): DocPatch | null => {
  const index = buildGroupIndex(stored);
  const units = selectionUnits(index, selected);
  if (units.length === 0) return null;

  const targets = new Map<string, StoredElement>();
  const note = (id: string) => {
    const element = index.shapes.get(id) ?? index.groups.get(id);
    if (element) targets.set(id, element);
  };
  for (const unit of units) {
    if (locked) {
      if (!isEffectivelyLocked(index, unit)) note(unit);
    } else {
      note(unit);
      for (const leaf of index.leavesOf.get(unit) ?? []) note(leaf);
      for (const group of index.groups.keys()) if (ancestorsOf(index, group).includes(unit)) note(group);
      for (const ancestor of ancestorsOf(index, unit)) note(ancestor);
    }
  }
  const update: StoredElement[] = [];
  for (const element of targets.values()) {
    if (locked ? element.locked !== true : element.locked !== undefined) update.push(asUpdate(element, { locked: locked ? true : undefined }));
  }
  return update.length === 0 ? null : { add: [], update, remove: [] };
};

export const planRenameGroup = (stored: readonly StoredElement[], groupId: string, name: string): DocPatch | null => {
  const record = stored.find((item): item is GroupRecord => isGroupRecord(item) && item.id === groupId);
  if (!record) return null;
  const next = name.trim().slice(0, 80);
  if ((record.name ?? "") === next) return null;
  return { add: [], update: [asUpdate(record, { name: next || undefined })], remove: [] };
};

type Connected = DrawingElement & {
  startConnection?: { elementId?: string };
  endConnection?: { elementId?: string };
};

/**
 * Everything that has to go when `ids` are deleted: the shapes, the connectors attached to them
 * (never a locked connector) and every group left without a shape. Locked shapes are never removed.
 */
export const planDelete = (stored: readonly StoredElement[], ids: readonly string[]): DocPatch | null => {
  const index = buildGroupIndex(stored);
  const doomed = new Set(ids.filter((id) => index.shapes.has(id) && !isEffectivelyLocked(index, id)));
  if (doomed.size === 0) return null;
  for (const shape of index.shapes.values()) {
    if (shape.type !== "arrow" && shape.type !== "arrow-bidirectional") continue;
    const { startConnection, endConnection } = shape as Connected;
    const start = startConnection?.elementId;
    const end = endConnection?.elementId;
    if (((start && doomed.has(start)) || (end && doomed.has(end))) && !isEffectivelyLocked(index, shape.id)) doomed.add(shape.id);
  }
  return withPrunedGroups(stored, { add: [], update: [], remove: [...doomed] });
};

/** Ids of the groups an eraser/AI/other removal of `removed` would leave empty (for the storage mutation). */
export const groupsEmptiedBy = (stored: readonly StoredElement[], removed: ReadonlySet<string>): string[] =>
  deadGroupIds(stored.filter((item) => !removed.has(item.id)));

export { splitStored, isEmptyPatch };
export type { GroupIndex };

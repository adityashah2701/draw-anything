import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";

/**
 * One atomic change to the stored list. Commands compute it as a pure value; the editor applies it in
 * a single storage mutation, so a command is always exactly one undo step. `update` entries are
 * merged into the stored element (a key set to `undefined` removes it), `add` entries are appended
 * (on top of the stacking order), `remove` entries are deleted.
 */
export interface DocPatch {
  add: StoredElement[];
  update: StoredElement[];
  remove: string[];
}

export const emptyPatch = (): DocPatch => ({ add: [], update: [], remove: [] });

export const isEmptyPatch = (patch: DocPatch) => patch.add.length === 0 && patch.update.length === 0 && patch.remove.length === 0;

/** The merge the storage layer performs for an update: provided keys win, `undefined` deletes. */
export const mergeStored = <T extends StoredElement>(current: T, change: Partial<StoredElement> & { id: string }): T => {
  const merged: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged as unknown as T;
};

/**
 * Reference semantics of a patch on a plain list. The editor's storage mutation does the same on the
 * shared list; tests use this to check commands without a room.
 */
export const applyPatch = (stored: readonly StoredElement[], patch: DocPatch): StoredElement[] => {
  const removed = new Set(patch.remove);
  const updates = new Map(patch.update.map((element) => [element.id, element]));
  const out: StoredElement[] = [];
  for (const item of stored) {
    if (removed.has(item.id)) continue;
    const change = updates.get(item.id);
    out.push(change ? mergeStored(item, change) : item);
  }
  for (const added of patch.add) if (!removed.has(added.id)) out.push(added);
  return out;
};

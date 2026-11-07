import { stampForAdd, stampForUpdate, withStamp, withUpdateStamp } from "@/core/layout/placement";
import type { DrawingElement, StoredElement } from "@/core/model";

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
  /**
   * The stacking order the list should have once the rest of the patch is applied: every stored id, in
   * order (array order is z-order). Applied in the same mutation, so a command that creates or removes
   * elements AND restacks them is still one undo step. Ignored unless it is exactly a permutation of what
   * remains, so a stale order can never scramble or drop anything.
   */
  order?: readonly string[];
  /**
   * Where the positions in this patch come from: a person or an AI edit made for one (`user`, the default), or a
   * layout applying its own result (`layout`). The storage boundary turns it into each element's placement
   * stamp (`core/layout/placement.ts`); a command never stamps by hand.
   */
  origin?: "user" | "layout";
  /** Per-element stamps that win over `origin` (diagram-code apply: explicit x and y in code are `user`, engine-placed nodes `auto`). */
  placements?: Readonly<Record<string, "auto" | "user">>;
}

export const emptyPatch = (): DocPatch => ({ add: [], update: [], remove: [] });

export const isEmptyPatch = (patch: DocPatch) =>
  patch.add.length === 0 && patch.update.length === 0 && patch.remove.length === 0 && (patch.order === undefined || patch.order.length === 0);

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
  const origin = patch.origin ?? "user";
  const out: StoredElement[] = [];
  for (const item of stored) {
    if (removed.has(item.id)) continue;
    const change = updates.get(item.id);
    out.push(change ? mergeStored(item, withUpdateStamp(change, stampForUpdate(item as DrawingElement, change as Partial<DrawingElement>, origin, patch.placements?.[item.id]))) : item);
  }
  for (const added of patch.add) if (!removed.has(added.id)) out.push(withStamp(added, stampForAdd(added, origin, patch.placements?.[added.id])));
  return patch.order ? restack(out, patch.order) : out;
};

/** `items` in `order`, or unchanged when `order` is not exactly a permutation of their ids. */
export const restack = <T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] => {
  if (order.length !== items.length) return [...items];
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length || new Set(order).size !== order.length) return [...items];
  const out: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item) return [...items];
    out.push(item);
  }
  return out;
};

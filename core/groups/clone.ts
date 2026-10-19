import type { DrawingElement, GroupRecord, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildGroupIndex, isEffectivelyLocked, type GroupIndex } from "./group-index";

/**
 * The group records that travel with a copy: every group whose shapes are *all* among the copied
 * ones (so a half-copied group is not duplicated as a smaller look-alike). Stacking order of the
 * records follows the stored list.
 */
export const collectCopyGroups = (stored: readonly StoredElement[], copiedIds: ReadonlySet<string>): GroupRecord[] => {
  const index = buildGroupIndex(stored);
  const out: GroupRecord[] = [];
  for (const [id, record] of index.groups) {
    if (index.leavesOf.get(id)!.every((leaf) => copiedIds.has(leaf))) out.push(record);
  }
  return out;
};

/** Groups a pasted shape may join without surprising anyone: they exist here and are not locked. */
export const attachableGroupIds = (index: GroupIndex): Set<string> => {
  const out = new Set<string>();
  for (const id of index.groups.keys()) if (!isEffectivelyLocked(index, id)) out.add(id);
  return out;
};

/**
 * Stamp group membership onto freshly cloned shapes and clone the group records alongside them.
 *
 * `copies[i]` is the clone of `shapes[i]`. A copy keeps the (cloned) group structure it came from.
 * Where its group was only partly copied, it stays in the original group when that still exists and
 * is in `attachable` (duplicating a child inside a group keeps it in the group); otherwise it ends
 * up at the top level. A dangling reference is never carried over.
 */
export const regroupClones = (
  shapes: readonly DrawingElement[],
  copies: readonly DrawingElement[],
  groups: readonly GroupRecord[],
  newId: () => string,
  attachable: ReadonlySet<string>,
): { shapes: DrawingElement[]; groups: GroupRecord[] } => {
  const groupIdMap = new Map(groups.map((group) => [group.id, newId()]));
  const parentFor = (original: string | undefined): string | undefined => {
    if (original === undefined) return undefined;
    const mapped = groupIdMap.get(original);
    if (mapped) return mapped;
    return attachable.has(original) ? original : undefined;
  };
  const nextShapes = copies.map((copy, i) => ({ ...copy, groupId: parentFor(shapes[i].groupId) }) as DrawingElement);
  const nextGroups = groups.map(
    (group) =>
      ({
        ...structuredClone(group),
        id: groupIdMap.get(group.id)!,
        groupId: parentFor(group.groupId),
      }) as GroupRecord,
  );
  return { shapes: nextShapes, groups: nextGroups };
};

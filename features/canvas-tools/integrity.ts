import { isGroupRecord } from "@/core/groups/group-index";
import { applyPatch, type DocPatch } from "@/core/groups/patch";
import { getShapeDefinition } from "@/core/shapes/shape-runtime";
import type { DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { MAX_ELEMENTS_ON_BOARD } from "./schemas";

type Connected = DrawingElement & { startConnection?: { elementId?: string }; endConnection?: { elementId?: string } };

const finitePoints = (points: unknown): boolean =>
  Array.isArray(points) && points.every((p) => p && typeof p === "object" && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y));

/**
 * Checks a patch BEFORE it is written: ids stay unique, what it touches is well-formed and refers to
 * things that exist, and it does not leave a connector pointing at an element it removes. Returns the
 * problems found (empty = fine). A tool whose patch fails this is refused whole, so the board is never
 * left half-edited.
 */
export const checkPatch = (before: readonly StoredElement[], patch: DocPatch): string[] => {
  const problems: string[] = [];
  const existing = new Set(before.map((item) => item.id));
  const removed = new Set(patch.remove);

  const seenAdds = new Set<string>();
  for (const added of patch.add) {
    if (typeof added.id !== "string" || added.id.length === 0) problems.push("an added element has no id");
    else if (seenAdds.has(added.id)) problems.push(`id "${added.id}" is added twice`);
    else if (existing.has(added.id) && !removed.has(added.id)) problems.push(`id "${added.id}" already exists on the board`);
    seenAdds.add(added.id);
  }
  for (const updated of patch.update) {
    if (!existing.has(updated.id) && !seenAdds.has(updated.id)) problems.push(`cannot update "${updated.id}": it is not on the board`);
  }

  const after = applyPatch(before, patch);
  if (after.length > MAX_ELEMENTS_ON_BOARD) problems.push(`the board would hold ${after.length} elements; the limit is ${MAX_ELEMENTS_ON_BOARD}`);

  const ids = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of after) (ids.has(item.id) ? duplicates : ids).add(item.id);
  if (duplicates.size > 0) problems.push(`duplicate ids after the change: ${[...duplicates].slice(0, 5).join(", ")}`);

  const groups = new Set(after.filter(isGroupRecord).map((record) => record.id));
  const shapes = new Set(after.filter((item) => !isGroupRecord(item)).map((item) => item.id));
  const touched = new Set([...patch.add.map((e) => e.id), ...patch.update.map((e) => e.id)]);

  for (const item of after) {
    if (!touched.has(item.id)) continue;
    if (isGroupRecord(item)) {
      if (item.groupId !== undefined && (item.groupId === item.id || !groups.has(item.groupId))) problems.push(`group "${item.id}" is nested in "${item.groupId}", which is not a group`);
      continue;
    }
    const shape = item as DrawingElement;
    if (!getShapeDefinition(shape.type)) problems.push(`"${shape.id}" has an unknown type "${String(shape.type)}"`);
    if (!finitePoints(shape.points) || shape.points.length === 0) problems.push(`"${shape.id}" has invalid points`);
    if (shape.groupId !== undefined && (shape.groupId === shape.id || !groups.has(shape.groupId))) problems.push(`"${shape.id}" is in group "${shape.groupId}", which does not exist`);
    if (shape.type === "arrow" || shape.type === "arrow-bidirectional") {
      for (const end of [(shape as Connected).startConnection?.elementId, (shape as Connected).endConnection?.elementId]) {
        if (end !== undefined && !shapes.has(end)) problems.push(`connector "${shape.id}" is attached to "${end}", which is not on the board`);
      }
    }
  }

  // A connector this patch did not touch must not be orphaned by it.
  for (const item of after) {
    if (isGroupRecord(item) || touched.has(item.id)) continue;
    const shape = item as Connected;
    if (shape.type !== "arrow" && shape.type !== "arrow-bidirectional") continue;
    for (const end of [shape.startConnection?.elementId, shape.endConnection?.elementId]) {
      if (end !== undefined && removed.has(end) && !shapes.has(end)) problems.push(`removing "${end}" would leave connector "${shape.id}" attached to nothing`);
    }
  }
  return [...new Set(problems)].slice(0, 8);
};

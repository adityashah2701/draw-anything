import { useCallback, useMemo } from "react";
import { planGroup, planRenameGroup, planSetLocked, planUngroup } from "@/core/groups/group-commands";
import { effectiveContext, enterableGroup, exitGroup } from "./group-selection";
import { isEffectivelyLocked, leavesOfUnit, selectionUnits, type GroupIndex } from "@/core/groups/group-index";
import type { DocPatch } from "@/core/groups/patch";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";

interface Props {
  stored: StoredElement[];
  groupIndex: GroupIndex;
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  /** The group the user has entered (may be stale: use `effectiveContext`). */
  enteredGroupId: string | null;
  setEnteredGroupId: (id: string | null) => void;
  hasEditAccess: boolean;
  generateId: () => string;
  /** One storage mutation = one undo step. */
  applyPatch: (patch: DocPatch) => void;
}

/** Group, ungroup, lock, rename, enter and leave: thin wiring over the pure plans in `core/groups`. */
export const useGroupCommands = ({
  stored,
  groupIndex,
  selectedElements,
  setSelectedElements,
  enteredGroupId,
  setEnteredGroupId,
  hasEditAccess,
  generateId,
  applyPatch,
}: Props) => {
  const units = useMemo(() => selectionUnits(groupIndex, selectedElements), [groupIndex, selectedElements]);
  const context = effectiveContext(groupIndex, enteredGroupId);

  const state = useMemo(() => {
    const movable = units.filter((unit) => !isEffectivelyLocked(groupIndex, unit));
    return {
      canGroup: movable.length >= 2,
      canUngroup: movable.some((unit) => groupIndex.groups.has(unit)),
      /** Every selected unit is locked (so the next lock command unlocks). */
      allLocked: units.length > 0 && units.every((unit) => isEffectivelyLocked(groupIndex, unit)),
      anyLocked: units.some((unit) => isEffectivelyLocked(groupIndex, unit)),
      /** The single selected group, if the selection is exactly one group. */
      selectedGroupId: units.length === 1 && groupIndex.groups.has(units[0]) ? units[0] : null,
    };
  }, [groupIndex, units]);

  const group = useCallback(() => {
    if (!hasEditAccess) return;
    const plan = planGroup(stored, selectedElements, generateId);
    if (!plan) return;
    applyPatch(plan.patch);
    setSelectedElements(plan.selection);
  }, [applyPatch, generateId, hasEditAccess, selectedElements, setSelectedElements, stored]);

  const ungroup = useCallback(() => {
    if (!hasEditAccess) return;
    const plan = planUngroup(stored, selectedElements);
    if (!plan) return;
    applyPatch(plan.patch);
    setSelectedElements(plan.selection);
    // Dissolving the group the user is inside leaves them in its parent.
    if (context !== null && plan.groups.includes(context)) setEnteredGroupId(groupIndex.parentOf.get(context) ?? null);
  }, [applyPatch, context, groupIndex, hasEditAccess, selectedElements, setEnteredGroupId, setSelectedElements, stored]);

  const setLocked = useCallback(
    (locked: boolean) => {
      if (!hasEditAccess) return;
      const patch = planSetLocked(stored, selectedElements, locked);
      if (patch) applyPatch(patch);
    },
    [applyPatch, hasEditAccess, selectedElements, stored],
  );

  const toggleLock = useCallback(() => setLocked(!state.allLocked), [setLocked, state.allLocked]);

  const rename = useCallback(
    (groupId: string, name: string) => {
      if (!hasEditAccess) return;
      const patch = planRenameGroup(stored, groupId, name);
      if (patch) applyPatch(patch);
    },
    [applyPatch, hasEditAccess, stored],
  );

  /** Step into the selected group (or the one given), leaving nothing selected so a child can be picked. */
  const enter = useCallback(
    (groupId?: string) => {
      const target = groupId ?? enterableGroup(groupIndex, selectedElements);
      if (!target || !groupIndex.groups.has(target)) return false;
      setEnteredGroupId(target);
      setSelectedElements([]);
      return true;
    },
    [groupIndex, selectedElements, setEnteredGroupId, setSelectedElements],
  );

  /** Leave the entered group, selecting it. False when no group is entered. */
  const exit = useCallback(() => {
    const out = exitGroup(groupIndex, enteredGroupId);
    if (!out) return false;
    setEnteredGroupId(out.context);
    setSelectedElements(out.select);
    return true;
  }, [enteredGroupId, groupIndex, setEnteredGroupId, setSelectedElements]);

  /** Select every shape of a group (e.g. from its name tag). */
  const selectGroup = useCallback(
    (groupId: string) => setSelectedElements([...leavesOfUnit(groupIndex, groupId)]),
    [groupIndex, setSelectedElements],
  );

  return { ...state, units, context, group, ungroup, setLocked, toggleLock, rename, enter, exit, selectGroup };
};

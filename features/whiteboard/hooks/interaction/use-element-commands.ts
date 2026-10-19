import { useCallback, useMemo } from "react";
import { attachableGroupIds, collectCopyGroups, regroupClones } from "@/core/groups/clone";
import { isEffectivelyLocked, type GroupIndex } from "@/core/groups/group-index";
import { storedOrderFromShapes } from "@/core/groups/order";
import type { DocPatch } from "@/core/groups/patch";
import { expandOffsets, unitBoxes, type Offset } from "@/core/groups/units";
import type { Bounds, DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  alignOffsets,
  cloneElements,
  collectCopySet,
  distributeOffsets,
  reorder,
  type AlignMode,
  type DistributeAxis,
  type ZMove,
} from "@/features/whiteboard/utils/arrange";
import { copyToClipboard, hasClipboard, takeFromClipboard } from "@/features/whiteboard/utils/clipboard";
import { planShapeMoves, uniformOffsets } from "@/features/whiteboard/utils/move-plan";

const PASTE_STEP = 24;

interface Props {
  /** The whole stored list (shapes and group records). */
  stored: StoredElement[];
  /** Its shapes. */
  elements: DrawingElement[];
  groupIndex: GroupIndex;
  /** Selected shape ids (a selected group is all of its shapes). */
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  hasEditAccess: boolean;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  generateId: () => string;
  /** Each of these is ONE storage mutation, hence one undo step. */
  applyPatch: (patch: DocPatch) => void;
  updateElements: (elements: DrawingElement[]) => void;
  /** Full stored order, group records included. */
  reorderElements: (orderedIds: string[]) => void;
  deleteElements: (ids: string[]) => void;
  /** Connectors that must follow the moved elements (same routing as dragging). */
  rerouteConnectedArrows: (moved: DrawingElement[]) => DrawingElement[];
}

/** Copy, paste, duplicate, nudge, align, distribute and z-order for the current selection, group-aware and lock-aware. */
export const useElementCommands = ({
  stored,
  elements,
  groupIndex,
  selectedElements,
  setSelectedElements,
  hasEditAccess,
  getElementBounds,
  generateId,
  applyPatch,
  updateElements,
  reorderElements,
  deleteElements,
  rerouteConnectedArrows,
}: Props) => {
  const selectedSet = useMemo(() => new Set(selectedElements), [selectedElements]);
  const unlockedSelection = useMemo(
    () => selectedElements.filter((id) => groupIndex.shapes.has(id) && !isEffectivelyLocked(groupIndex, id)),
    [groupIndex, selectedElements],
  );

  const copy = useCallback(() => {
    if (selectedElements.length === 0) return;
    const shapes = collectCopySet(elements, selectedSet);
    copyToClipboard(shapes, collectCopyGroups(stored, new Set(shapes.map((shape) => shape.id))));
  }, [elements, selectedElements.length, selectedSet, stored]);

  const insertCopies = useCallback(
    (source: DrawingElement[], groups: ReturnType<typeof collectCopyGroups>, step: number) => {
      const offset = { dx: PASTE_STEP * step, dy: PASTE_STEP * step };
      const clones = cloneElements(source, offset, generateId);
      const regrouped = regroupClones(source, clones, groups, generateId, attachableGroupIds(groupIndex));
      applyPatch({ add: [...regrouped.groups, ...regrouped.shapes], update: [], remove: [] });
      setSelectedElements(regrouped.shapes.map((shape) => shape.id));
    },
    [applyPatch, generateId, groupIndex, setSelectedElements],
  );

  const paste = useCallback(() => {
    if (!hasEditAccess) return;
    const taken = takeFromClipboard();
    if (taken) insertCopies(taken.elements, taken.groups, taken.step);
  }, [hasEditAccess, insertCopies]);

  const duplicate = useCallback(() => {
    if (!hasEditAccess || selectedElements.length === 0) return;
    const shapes = collectCopySet(elements, selectedSet);
    insertCopies(shapes, collectCopyGroups(stored, new Set(shapes.map((shape) => shape.id))), 1);
  }, [elements, hasEditAccess, insertCopies, selectedElements.length, selectedSet, stored]);

  const cut = useCallback(() => {
    if (!hasEditAccess || selectedElements.length === 0) return;
    copy();
    deleteElements(selectedElements);
    // Locked shapes survive a cut; whatever is left stays selected.
    setSelectedElements(selectedElements.filter((id) => isEffectivelyLocked(groupIndex, id)));
  }, [copy, deleteElements, groupIndex, hasEditAccess, selectedElements, setSelectedElements]);

  /** Moves shapes by per-shape offsets and re-routes the connectors that must follow, as one batch. */
  const applyOffsets = useCallback(
    (offsets: Map<string, Offset>) => {
      const changed = planShapeMoves(
        elements.filter((el) => offsets.has(el.id)),
        offsets,
        rerouteConnectedArrows,
      );
      if (changed.length > 0) updateElements(changed);
    },
    [elements, rerouteConnectedArrows, updateElements],
  );

  const boundsOfShape = useCallback(
    (id: string) => {
      const shape = groupIndex.shapes.get(id);
      return shape ? getElementBounds(shape) : null;
    },
    [getElementBounds, groupIndex],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!hasEditAccess) return;
      applyOffsets(uniformOffsets(elements.filter((el) => unlockedSelection.includes(el.id)), dx, dy));
    },
    [applyOffsets, elements, hasEditAccess, unlockedSelection],
  );

  const align = useCallback(
    (mode: AlignMode) => {
      if (!hasEditAccess) return;
      // Groups align as one box; locked boxes still count as the reference but never move.
      const units = unitBoxes(groupIndex, selectedElements, boundsOfShape);
      applyOffsets(expandOffsets(units, alignOffsets(units, mode)));
    },
    [applyOffsets, boundsOfShape, groupIndex, hasEditAccess, selectedElements],
  );

  const distribute = useCallback(
    (axis: DistributeAxis) => {
      if (!hasEditAccess) return;
      const units = unitBoxes(groupIndex, selectedElements, boundsOfShape).filter((unit) => !unit.locked);
      applyOffsets(expandOffsets(units, distributeOffsets(units, axis)));
    },
    [applyOffsets, boundsOfShape, groupIndex, hasEditAccess, selectedElements],
  );

  const zOrder = useCallback(
    (move: ZMove) => {
      if (!hasEditAccess || unlockedSelection.length === 0) return;
      const order = reorder(elements.map((el) => el.id), new Set(unlockedSelection), move);
      reorderElements(storedOrderFromShapes(stored, order));
    },
    [elements, hasEditAccess, reorderElements, stored, unlockedSelection],
  );

  return { copy, cut, paste, duplicate, nudge, align, distribute, zOrder, canPaste: hasClipboard };
};

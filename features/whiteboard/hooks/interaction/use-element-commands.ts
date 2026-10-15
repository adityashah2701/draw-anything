import { useCallback, useMemo } from "react";
import { moveShape } from "@/core/shapes/shape-runtime";
import type { Bounds, DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  alignOffsets,
  cloneElements,
  collectCopySet,
  distributeOffsets,
  reorder,
  type AlignMode,
  type DistributeAxis,
  type Offset,
  type ZMove,
} from "@/features/whiteboard/utils/arrange";
import { copyToClipboard, hasClipboard, takeFromClipboard } from "@/features/whiteboard/utils/clipboard";

const PASTE_STEP = 24;

interface Props {
  elements: DrawingElement[];
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  hasEditAccess: boolean;
  getElementBounds: (element: DrawingElement) => Bounds | null;
  generateId: () => string;
  /** Each of these is ONE storage mutation, hence one undo step. */
  addElements: (elements: DrawingElement[]) => void;
  updateElements: (elements: DrawingElement[]) => void;
  reorderElements: (orderedIds: string[]) => void;
  deleteElements: (ids: string[]) => void;
  /** Connectors that must follow the moved elements (same routing as dragging). */
  rerouteConnectedArrows: (moved: DrawingElement[]) => DrawingElement[];
}

/** Copy, paste, duplicate, nudge, align, distribute and z-order for the current selection. */
export const useElementCommands = ({
  elements,
  selectedElements,
  setSelectedElements,
  hasEditAccess,
  getElementBounds,
  generateId,
  addElements,
  updateElements,
  reorderElements,
  deleteElements,
  rerouteConnectedArrows,
}: Props) => {
  const selectedSet = useMemo(() => new Set(selectedElements), [selectedElements]);

  const copy = useCallback(() => {
    if (selectedElements.length === 0) return;
    copyToClipboard(collectCopySet(elements, selectedSet));
  }, [elements, selectedElements.length, selectedSet]);

  const insertCopies = useCallback(
    (source: DrawingElement[], step: number) => {
      const copies = cloneElements(source, { dx: PASTE_STEP * step, dy: PASTE_STEP * step }, generateId);
      addElements(copies);
      setSelectedElements(copies.map((c) => c.id));
    },
    [addElements, generateId, setSelectedElements],
  );

  const paste = useCallback(() => {
    if (!hasEditAccess) return;
    const taken = takeFromClipboard();
    if (taken) insertCopies(taken.elements, taken.step);
  }, [hasEditAccess, insertCopies]);

  const duplicate = useCallback(() => {
    if (!hasEditAccess || selectedElements.length === 0) return;
    insertCopies(collectCopySet(elements, selectedSet), 1);
  }, [elements, hasEditAccess, insertCopies, selectedElements.length, selectedSet]);

  const cut = useCallback(() => {
    if (!hasEditAccess || selectedElements.length === 0) return;
    copy();
    deleteElements(selectedElements);
    setSelectedElements([]);
  }, [copy, deleteElements, hasEditAccess, selectedElements, setSelectedElements]);

  /** Applies per-element offsets and the connector reroutes they cause as one batch. */
  const applyOffsets = useCallback(
    (offsets: Map<string, Offset>) => {
      const moved = elements
        .filter((el) => offsets.has(el.id))
        .map((el) => moveShape(el, { x: offsets.get(el.id)!.dx, y: offsets.get(el.id)!.dy }));
      if (moved.length === 0) return;
      const movedIds = new Set(moved.map((m) => m.id));
      const arrows = rerouteConnectedArrows(moved).filter((a) => !movedIds.has(a.id));
      updateElements([...moved, ...arrows]);
    },
    [elements, rerouteConnectedArrows, updateElements],
  );

  const selectionBoxes = useCallback(
    () =>
      elements
        .filter((el) => selectedSet.has(el.id))
        .flatMap((el) => {
          const bounds = getElementBounds(el);
          return bounds ? [{ id: el.id, bounds }] : [];
        }),
    [elements, getElementBounds, selectedSet],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!hasEditAccess) return;
      applyOffsets(new Map(selectedElements.map((id) => [id, { dx, dy }])));
    },
    [applyOffsets, hasEditAccess, selectedElements],
  );

  const align = useCallback(
    (mode: AlignMode) => hasEditAccess && applyOffsets(alignOffsets(selectionBoxes(), mode)),
    [applyOffsets, hasEditAccess, selectionBoxes],
  );

  const distribute = useCallback(
    (axis: DistributeAxis) => hasEditAccess && applyOffsets(distributeOffsets(selectionBoxes(), axis)),
    [applyOffsets, hasEditAccess, selectionBoxes],
  );

  const zOrder = useCallback(
    (move: ZMove) => {
      if (!hasEditAccess || selectedElements.length === 0) return;
      reorderElements(reorder(elements.map((el) => el.id), selectedSet, move));
    },
    [elements, hasEditAccess, reorderElements, selectedElements.length, selectedSet],
  );

  return { copy, cut, paste, duplicate, nudge, align, distribute, zOrder, canPaste: hasClipboard };
};

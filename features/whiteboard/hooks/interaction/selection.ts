export interface ClickSelectionInput {
  selected: readonly string[];
  /** Id of the topmost shape under the pointer, or null for empty canvas. */
  hitId: string | null;
  /** Shift, Ctrl or Cmd held: toggle instead of replace. */
  additive: boolean;
}

export interface ClickSelectionResult {
  selected: string[];
  /** Whether holding the button down should start moving the selection. */
  startDrag: boolean;
  /**
   * Set when a plain click landed on one member of a multi-selection. The
   * group must stay selected so it can be dragged, but if the pointer is
   * released without moving, the selection collapses to this shape.
   */
  collapseOnRelease: string | null;
}

export const resolveClickSelection = ({
  selected,
  hitId,
  additive,
}: ClickSelectionInput): ClickSelectionResult => {
  const current = Array.from(new Set(selected));

  if (hitId === null) {
    return { selected: additive ? current : [], startDrag: false, collapseOnRelease: null };
  }

  const isSelected = current.includes(hitId);
  if (additive) {
    return isSelected
      ? { selected: current.filter((id) => id !== hitId), startDrag: false, collapseOnRelease: null }
      : { selected: [...current, hitId], startDrag: true, collapseOnRelease: null };
  }

  if (isSelected) {
    return {
      selected: current,
      startDrag: true,
      collapseOnRelease: current.length > 1 ? hitId : null,
    };
  }
  return { selected: [hitId], startDrag: true, collapseOnRelease: null };
};

import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { unionBounds } from "@/core/geometry/box";
import { isEffectivelyLocked, leavesOfUnit, selectionUnits, type GroupIndex } from "./group-index";

export interface Offset {
  dx: number;
  dy: number;
}

/** A selection unit (a shape or a whole group) as the arrange commands see it. */
export interface UnitBox {
  id: string;
  bounds: Bounds;
  /** Shapes it stands for. */
  leaves: readonly string[];
  /** Locked units take part as references but are never moved. */
  locked: boolean;
}

/** Bounds and shape ids of each selected unit; units without measurable bounds are left out. */
export const unitBoxes = (index: GroupIndex, selected: readonly string[], getBounds: (shapeId: string) => Bounds | null): UnitBox[] => {
  const out: UnitBox[] = [];
  for (const id of selectionUnits(index, selected)) {
    const leaves = leavesOfUnit(index, id);
    const bounds = unionBounds(leaves.flatMap((leaf) => getBounds(leaf) ?? []));
    if (bounds) out.push({ id, bounds, leaves, locked: isEffectivelyLocked(index, id) });
  }
  return out;
};

/** Per-unit offsets spread to every shape in the unit; locked units are skipped. */
export const expandOffsets = (units: readonly UnitBox[], offsets: ReadonlyMap<string, Offset>): Map<string, Offset> => {
  const out = new Map<string, Offset>();
  for (const unit of units) {
    const offset = offsets.get(unit.id);
    if (!offset || unit.locked || (offset.dx === 0 && offset.dy === 0)) continue;
    for (const leaf of unit.leaves) out.set(leaf, offset);
  }
  return out;
};

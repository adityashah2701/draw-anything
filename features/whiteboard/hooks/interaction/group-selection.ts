import {
  ancestorsOf,
  expandUnits,
  leavesOfUnit,
  rootOf,
  selectionUnits,
  unitUnder,
  type GroupIndex,
} from "@/core/groups/group-index";
import { resolveClickSelection } from "./selection";

/**
 * Selection rules for composite groups. Pure and shape-id based: the editor keeps a selection of
 * *shape* ids, and these functions decide what a click, a marquee or a double-click turns it into.
 * "Entered" is the group the user has stepped into to edit its children (null = top level).
 */

/** The entered group if it still exists (it may have been deleted or undone away), else null. */
export const effectiveContext = (index: GroupIndex, entered: string | null): string | null =>
  entered !== null && index.groups.has(entered) ? entered : null;

export interface HitResolution {
  /** What the click selects: a shape or a whole group. */
  unitId: string;
  /** The group the user is working inside after the click (null = top level). */
  context: string | null;
}

/**
 * A click on shape `hitId`. Inside the entered group it picks that group's direct child; a shape
 * outside it is resolved against the nearest enclosing group the user has entered (so siblings of the
 * entered group stay reachable), and finally against the top level.
 */
export const resolveHit = (index: GroupIndex, hitId: string, entered: string | null): HitResolution => {
  const start = effectiveContext(index, entered);
  if (start !== null) {
    for (const context of [start, ...ancestorsOf(index, start)]) {
      const unitId = unitUnder(index, hitId, context);
      if (unitId !== null) return { unitId, context };
    }
  }
  return { unitId: rootOf(index, hitId), context: null };
};

export interface ClickInput {
  selected: readonly string[];
  /** Topmost shape under the pointer, or null for empty canvas. */
  hitId: string | null;
  additive: boolean;
  entered: string | null;
}

export interface ClickOutcome {
  /** Shape ids to select. */
  selected: string[];
  startDrag: boolean;
  /** Shapes to collapse the selection to if the pointer is released without moving. */
  collapseOnRelease: string[] | null;
  context: string | null;
}

/** `resolveClickSelection`, lifted from shapes to selection units so a group behaves like one shape. */
export const resolveGroupClick = (index: GroupIndex, { selected, hitId, additive, entered }: ClickInput): ClickOutcome => {
  const units = selectionUnits(index, selected);
  const hit = hitId === null ? null : resolveHit(index, hitId, entered);
  const outcome = resolveClickSelection({ selected: units, hitId: hit?.unitId ?? null, additive });
  const context = hit ? hit.context : additive ? effectiveContext(index, entered) : null;
  return {
    selected: expandUnits(index, outcome.selected),
    startDrag: outcome.startDrag,
    collapseOnRelease: outcome.collapseOnRelease ? [...leavesOfUnit(index, outcome.collapseOnRelease)] : null,
    context,
  };
};

/** Marquee result: every group the box touches is taken whole (inside the entered group: its touched children). */
export const resolveMarquee = (index: GroupIndex, hitIds: readonly string[], entered: string | null): { selected: string[]; context: string | null } => {
  const units = new Set<string>();
  const contexts = new Set<string | null>();
  for (const id of hitIds) {
    if (!index.shapes.has(id)) continue;
    const hit = resolveHit(index, id, entered);
    units.add(hit.unitId);
    contexts.add(hit.context);
  }
  // Stay inside the entered group only while everything the marquee touched is inside it.
  return { selected: expandUnits(index, [...units]), context: contexts.size === 1 ? [...contexts][0] : null };
};

export type DoubleClickAction = { kind: "enter"; group: string; select: string[] } | { kind: "edit" };

/** Double-click on a shape that sits in a group enters the group; on anything else it edits. */
export const resolveDoubleClick = (index: GroupIndex, hitId: string, entered: string | null): DoubleClickAction => {
  const hit = resolveHit(index, hitId, entered);
  if (!index.groups.has(hit.unitId)) return { kind: "edit" };
  const inner = unitUnder(index, hitId, hit.unitId);
  return { kind: "enter", group: hit.unitId, select: inner ? [...leavesOfUnit(index, inner)] : [] };
};

/** The group the selection is exactly one of, if any: what Enter steps into. */
export const enterableGroup = (index: GroupIndex, selected: readonly string[]): string | null => {
  const units = selectionUnits(index, selected);
  return units.length === 1 && index.groups.has(units[0]) ? units[0] : null;
};

/** Leaving the entered group (Escape): back to its parent with the group itself selected. */
export const exitGroup = (index: GroupIndex, entered: string | null): { context: string | null; select: string[] } | null => {
  const current = effectiveContext(index, entered);
  if (current === null) return null;
  return { context: index.parentOf.get(current) ?? null, select: [...leavesOfUnit(index, current)] };
};

import { groupLabel, isEffectivelyLocked, leavesOfUnit, selectionUnits, type GroupIndex } from "@/core/groups/group-index";
import { unionBounds } from "@/core/geometry/box";
import type { Bounds } from "@/features/whiteboard/types/whiteboard.types";

export interface OverlayUnit {
  id: string;
  bounds: Bounds;
  isGroup: boolean;
  /** Group name tag text (groups only). */
  label?: string;
  locked: boolean;
}

/**
 * What the canvas draws for the current selection, as plain data: one box per selected unit (a group
 * counts as one), a frame around the lot, and the outline of the group the user has entered. Kept
 * separate from drawing so the rules can be tested without a canvas.
 */
export interface SelectionOverlay {
  units: OverlayUnit[];
  /**
   * The frame that carries the resize handles; null when a lone plain shape draws its own box and
   * handles. It surrounds the units that can be edited (`unitIds`); locked units stay outside the
   * transform. When every unit is locked the frame is drawn, without handles.
   */
  frame: { bounds: Bounds; locked: boolean; unitIds: string[] } | null;
  entered: { id: string; bounds: Bounds; label: string } | null;
  /** True when this overlay stands in for the per-shape selection box and handles. */
  replacesShapeChrome: boolean;
}

export const buildSelectionOverlay = (
  index: GroupIndex,
  selected: readonly string[],
  entered: string | null,
  getBounds: (shapeId: string) => Bounds | null,
): SelectionOverlay | null => {
  const boundsOfUnit = (unit: string) => unionBounds(leavesOfUnit(index, unit).flatMap((leaf) => getBounds(leaf) ?? []));

  const units: OverlayUnit[] = [];
  for (const id of selectionUnits(index, selected)) {
    const bounds = boundsOfUnit(id);
    if (!bounds) continue;
    const group = index.groups.get(id);
    units.push({ id, bounds, isGroup: !!group, label: group ? groupLabel(group) : undefined, locked: isEffectivelyLocked(index, id) });
  }

  const enteredGroup = entered !== null ? index.groups.get(entered) : undefined;
  const enteredBounds = enteredGroup ? boundsOfUnit(entered!) : null;

  const replacesShapeChrome = units.length > 1 || (units.length === 1 && units[0].isGroup);
  const editable = units.filter((unit) => !unit.locked);
  const framed = editable.length > 0 ? editable : units;
  const frameBounds = replacesShapeChrome ? unionBounds(framed.map((unit) => unit.bounds)) : null;
  if (units.length === 0 && !enteredBounds) return null;

  return {
    units: replacesShapeChrome ? units : [],
    frame: frameBounds ? { bounds: frameBounds, locked: editable.length === 0, unitIds: framed.map((unit) => unit.id) } : null,
    entered: enteredGroup && enteredBounds ? { id: enteredGroup.id, bounds: enteredBounds, label: groupLabel(enteredGroup) } : null,
    replacesShapeChrome,
  };
};

/** Screen pixels between the selected shapes and the frame that carries the resize handles. */
export const FRAME_PAD_PX = 8;
/** How close (screen pixels) the pointer must be to a frame handle to grab it. */
export const FRAME_HANDLE_GRAB_PX = 9;

export interface FrameHandle {
  name: string;
  x: number;
  y: number;
}

/**
 * The 8 resize handles of a selection frame in world coordinates, sitting `FRAME_PAD_PX` outside the
 * content so they never cover it. The frame is drawn from, and hit-tested against, this one list.
 */
export const frameHandlePoints = (content: Bounds, zoom: number): FrameHandle[] => {
  const pad = FRAME_PAD_PX / zoom;
  const minX = content.minX - pad;
  const minY = content.minY - pad;
  const maxX = content.maxX + pad;
  const maxY = content.maxY + pad;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return [
    { name: "nw", x: minX, y: minY },
    { name: "n", x: cx, y: minY },
    { name: "ne", x: maxX, y: minY },
    { name: "e", x: maxX, y: cy },
    { name: "se", x: maxX, y: maxY },
    { name: "s", x: cx, y: maxY },
    { name: "sw", x: minX, y: maxY },
    { name: "w", x: minX, y: cy },
  ];
};

/** The frame handle under `point`, if any (corners win over edges where they overlap). */
export const frameHandleAt = (content: Bounds, point: { x: number; y: number }, zoom: number): FrameHandle | null => {
  const reach = FRAME_HANDLE_GRAB_PX / zoom;
  let best: FrameHandle | null = null;
  let bestDistance = Infinity;
  for (const handle of frameHandlePoints(content, zoom)) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance <= reach && distance < bestDistance - (handle.name.length === 2 ? 0.5 / zoom : 0)) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
};

import type { Bounds, DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";
import { isArrowElement } from "@/core/shapes/arrow/arrow-utils";
import { unionBounds } from "@/core/geometry/box";
import { rootOf, unitUnder, type GroupIndex } from "@/core/groups/group-index";
import { snapSelection, type AlignTarget, type Guide, type SnapOptions, type Span } from "@/core/snap/alignment";

export type { Guide, Span };
export { unionBounds };

export interface DragResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export interface DragInput {
  start: Point;
  point: Point;
  /** Bounds of everything being dragged, taken when the drag began. */
  selection: Bounds;
  /** Bounds of the shapes it may snap to (not the dragged ones). */
  targets: readonly Bounds[];
  /** World distance within which an edge or centre snaps. */
  threshold: number;
  snap: boolean;
}

const shifted = (b: Bounds, dx: number, dy: number): Bounds => ({
  minX: b.minX + dx,
  maxX: b.maxX + dx,
  minY: b.minY + dy,
  maxY: b.maxY + dy,
  width: b.width,
  height: b.height,
});

/**
 * Where a drag puts the selection. The position is always origin + total pointer travel (never an
 * accumulation of per-event deltas, so it cannot drift), then pulled onto nearby edges/centres of
 * other shapes. Guides describe every line that ended up aligned. (Edges and centres only: the full
 * smart-guide set, with spacing, baselines and distances, is `computeSmartDrag`.)
 */
export const computeDrag = ({ start, point, selection, targets, threshold, snap }: DragInput): DragResult => {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (!snap || targets.length === 0) return { dx, dy, guides: [] };
  const result = snapSelection({
    moving: shifted(selection, dx, dy),
    alignTargets: targets.map((box) => ({ box })),
    threshold,
  });
  return { dx: dx + result.dx, dy: dy + result.dy, guides: result.guides };
};

/** What a move started from. Positions are always `origin` plus the total pointer travel, never accumulated per event. */
export interface DragSession {
  start: Point;
  origin: DrawingElement[];
  selection: Bounds;
  /** Boxes of the shapes the selection may align with. */
  targets: Bounds[];
  /** The same shapes with their text baselines, for baseline guides. */
  alignTargets: AlignTarget[];
  /** Whole groups and loose shapes that spacing and distances are measured against. */
  spaceTargets: Bounds[];
  /** Absolute y of the moving selection's text baselines when the drag began. */
  baselines: number[];
}

export interface DragSessionOptions {
  /** Group structure: neighbours are measured as whole groups instead of their shapes. */
  index?: GroupIndex;
  /** The group being edited (null = top level): its children are the neighbours that count. */
  context?: string | null;
  /** Absolute y of an element's text baseline, or null if it has none. */
  baselineOf?: (element: DrawingElement) => number | null;
}

/** Null when none of the moving elements has bounds. Connectors, freehand and group frames are not alignment targets. */
export const startDragSession = (
  movingIds: readonly string[],
  elements: readonly DrawingElement[],
  point: Point,
  getBounds: (element: DrawingElement) => Bounds | null,
  { index, context = null, baselineOf }: DragSessionOptions = {},
): DragSession | null => {
  const moving = new Set(movingIds);
  const origin = elements.filter((el) => moving.has(el.id));
  const selection = unionBounds(origin.flatMap((el) => getBounds(el) ?? []));
  if (!selection) return null;

  const alignTargets: AlignTarget[] = [];
  const unitBoxes = new Map<string, Bounds[]>();
  for (const el of elements) {
    if (moving.has(el.id) || el.isGuide || el.type === "freehand" || isArrowElement(el)) continue;
    const box = getBounds(el);
    if (!box) continue;
    const baseline = baselineOf?.(el);
    alignTargets.push({ box, ...(baseline == null ? {} : { baselines: [baseline] }) });

    // Distances are between objects as the user sees them: a group is one box, however many shapes it holds.
    const unit = index ? (unitUnder(index, el.id, context) ?? rootOf(index, el.id)) : el.id;
    const boxes = unitBoxes.get(unit);
    if (boxes) boxes.push(box);
    else unitBoxes.set(unit, [box]);
  }

  return {
    start: point,
    origin,
    selection,
    targets: alignTargets.map((t) => t.box),
    alignTargets,
    spaceTargets: [...unitBoxes.values()].flatMap((boxes) => unionBounds(boxes) ?? []),
    baselines: origin.flatMap((el) => baselineOf?.(el) ?? []),
  };
};

export interface SmartDragInput {
  session: DragSession;
  point: Point;
  /** World distance within which a line or spacing snaps (the screen tolerance divided by zoom). */
  threshold: number;
  /** False while snapping is off (the setting, or Alt held). */
  snap: boolean;
  options?: SnapOptions;
}

export interface SmartDragResult extends DragResult {
  /** Equal-spacing marks and live distances to draw. */
  spans: Span[];
}

/** `computeDrag` with the whole smart-guide set: baselines, equal spacing and distances to neighbours. */
export const computeSmartDrag = ({ session, point, threshold, snap, options }: SmartDragInput): SmartDragResult => {
  const dx = point.x - session.start.x;
  const dy = point.y - session.start.y;
  if (!snap) return { dx, dy, guides: [], spans: [] };
  const result = snapSelection({
    moving: shifted(session.selection, dx, dy),
    movingBaselines: session.baselines.map((y) => y + dy),
    alignTargets: session.alignTargets,
    spaceTargets: session.spaceTargets,
    threshold,
    options,
  });
  return { dx: dx + result.dx, dy: dy + result.dy, guides: result.guides, spans: result.spans };
};

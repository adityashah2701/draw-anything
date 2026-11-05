import { unionBounds } from "@/core/geometry/box";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

const GAP = 64;

/**
 * Where a diagram that is still being generated is shown: the same place `generate_diagram` will put it (right of
 * what is on the board, else near the top-left of the view; see `defaultOrigin`), so the final patch lands where
 * the preview was. Pure.
 */
export const placePreview = (
  generated: readonly DrawingElement[],
  existing: readonly DrawingElement[],
  view: { zoom: number; pan: { x: number; y: number } } | null,
): DrawingElement[] => {
  // Group frames and connection labels are shown too: the tool keeps them (groups as real frames).
  const shown = generated.filter((el) => el.points.length > 0 && (el.isGuide !== true || ["group", "group-label", "edge-label"].includes(el.ai?.role ?? "")));
  if (shown.length === 0) return [];
  const board = unionBounds(existing.flatMap((el) => (el.isGuide ? [] : (getShapeBounds(el) ?? []))));
  const origin = board
    ? { x: Math.round(board.maxX + GAP), y: Math.round(board.minY) }
    : view && view.zoom > 0
      ? { x: Math.round(-view.pan.x / view.zoom + 80), y: Math.round(-view.pan.y / view.zoom + 80) }
      : { x: 80, y: 80 };
  const box = unionBounds(shown.flatMap((el) => getShapeBounds(el) ?? []));
  const dx = origin.x - (box?.minX ?? 0);
  const dy = origin.y - (box?.minY ?? 0);
  return shown.map((el) => ({ ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }) as DrawingElement);
};

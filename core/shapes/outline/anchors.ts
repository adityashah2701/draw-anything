import type { Anchor, AnchorSide, Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { buildAnchorId, generateAnchorsForShape } from "@/core/anchors/anchor-geometry";
import type { OutlineShape } from "@/core/shapes/outline/types";
import { resolveOutlineVariant } from "@/core/shapes/outline/variants";

/** The four sides, in world coordinates: the variant's own points, or the middle of the box's edge. */
export const getOutlineAnchors = (shape: OutlineShape, bounds: Bounds | null): Anchor[] => {
  if (!bounds) return [];
  const base = generateAnchorsForShape(shape.id, { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height });
  const own = resolveOutlineVariant(shape.variant).anchors?.(bounds.width, bounds.height);
  if (!own) return base;
  return base.map((anchor) => {
    const point = own[anchor.side as AnchorSide];
    return point ? { id: buildAnchorId(shape.id, anchor.side), side: anchor.side, x: bounds.minX + point.x, y: bounds.minY + point.y } : anchor;
  });
};

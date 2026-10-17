import { Anchor, Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { generateAnchorsForShape } from "@/core/anchors/anchor-geometry";
import { IconShape } from "@/core/shapes/icon/types";

export const getIconAnchors = (
  shape: IconShape,
  bounds: Bounds | null,
): Anchor[] => {
  if (!bounds) return [];
  return generateAnchorsForShape(shape.id, {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.width,
    height: bounds.height,
  });
};

import { Anchor, Bounds } from "@/features/whiteboard/types/whiteboard.types";
import { generateAnchorsForShape } from "@/core/anchors/anchor-geometry";
import { PillShape } from "@/core/shapes/pill/types";

export const getPillBounds = (shape: PillShape): Bounds | null => {
  if (shape.points.length < 2) return null;
  const [a, b] = shape.points;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/** The four edge midpoints, which all lie on a pill's outline. */
export const getPillAnchors = (shape: PillShape, bounds: Bounds | null): Anchor[] =>
  bounds ? generateAnchorsForShape(shape.id, { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height }) : [];

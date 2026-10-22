/**
 * Corner radii in world units, the one place they are decided. The scale follows what a shape is for: a plain
 * rectangle is the tightest, a frame (a container) is a step softer, and a semantic node (a labelled card with
 * an icon) is the softest rectangle. Pills are fully rounded and ellipses are true curves, so neither has a
 * token; diamonds and triangles keep their points and only round them with the stroke's round join.
 */
export const CORNER_RADIUS = {
  rectangle: 6,
  frame: 8,
  semanticNode: 10,
} as const;

/** The radius on screen: scaled by zoom, never more than half the shorter side. */
export const screenCornerRadius = (world: number, zoom: number, width: number, height: number) =>
  Math.min(world * zoom, Math.abs(width) / 2, Math.abs(height) / 2);

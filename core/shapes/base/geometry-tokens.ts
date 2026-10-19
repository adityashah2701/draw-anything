/** Corner radii in world units. Pills are fully rounded and ellipses are true curves, so neither has a token. */
export const CORNER_RADIUS = {
  rectangle: 6,
  semanticNode: 10,
} as const;

/** The radius on screen: scaled by zoom, never more than half the shorter side. */
export const screenCornerRadius = (world: number, zoom: number, width: number, height: number) =>
  Math.min(world * zoom, Math.abs(width) / 2, Math.abs(height) / 2);

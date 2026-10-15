export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MinimapTransform {
  scale: number;
  /** World coordinate drawn at the minimap's top-left corner. */
  originX: number;
  originY: number;
}

/**
 * Fits the content and the current viewport (either may be outside the other) into a minimap of
 * `size` px, keeping aspect ratio and centring. The viewport is included so its rectangle is
 * always visible, even when panned away from every element.
 */
export const minimapTransform = (
  content: Box | null,
  viewport: Box,
  size: { width: number; height: number },
  padding = 8,
): MinimapTransform => {
  const world: Box = content
    ? {
        minX: Math.min(content.minX, viewport.minX),
        minY: Math.min(content.minY, viewport.minY),
        maxX: Math.max(content.maxX, viewport.maxX),
        maxY: Math.max(content.maxY, viewport.maxY),
      }
    : viewport;
  const w = Math.max(1, world.maxX - world.minX);
  const h = Math.max(1, world.maxY - world.minY);
  const scale = Math.min((size.width - padding * 2) / w, (size.height - padding * 2) / h);
  return {
    scale,
    originX: world.minX - (size.width / scale - w) / 2,
    originY: world.minY - (size.height / scale - h) / 2,
  };
};

export const toMinimap = (t: MinimapTransform, p: { x: number; y: number }) => ({
  x: (p.x - t.originX) * t.scale,
  y: (p.y - t.originY) * t.scale,
});

export const toWorld = (t: MinimapTransform, p: { x: number; y: number }) => ({
  x: p.x / t.scale + t.originX,
  y: p.y / t.scale + t.originY,
});

export interface View {
  zoom: number;
  panOffset: { x: number; y: number };
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
/** Fit-to-content never enlarges past 100%: a 3-node diagram should not fill the screen at 400%. */
export const FIT_MAX_ZOOM = 1;
export const FIT_PADDING = 80;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Changes zoom while the world point under `anchor` (screen px, canvas-relative) stays under it. */
export const zoomAtPoint = (view: View, anchor: { x: number; y: number }, nextZoom: number): View => {
  const zoom = clampZoom(nextZoom);
  const worldX = (anchor.x - view.panOffset.x) / view.zoom;
  const worldY = (anchor.y - view.panOffset.y) / view.zoom;
  return { zoom, panOffset: { x: anchor.x - worldX * zoom, y: anchor.y - worldY * zoom } };
};

export type Pair = readonly [{ x: number; y: number }, { x: number; y: number }];

/**
 * Two-finger gesture: zoom by how much the fingers moved apart or together, and pan by how far their
 * midpoint moved, so the world point between the fingers stays between them. Points are canvas-relative px.
 * A pair that has collapsed to a point (no distance) only pans.
 */
export const pinchView = (view: View, from: Pair, to: Pair): View => {
  const dist = (p: Pair) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  const mid = (p: Pair) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const [d0, d1] = [dist(from), dist(to)];
  const zoom = clampZoom(d0 > 1 && d1 > 1 ? view.zoom * (d1 / d0) : view.zoom);
  const [m0, m1] = [mid(from), mid(to)];
  const worldX = (m0.x - view.panOffset.x) / view.zoom;
  const worldY = (m0.y - view.panOffset.y) / view.zoom;
  return { zoom, panOffset: { x: m1.x - worldX * zoom, y: m1.y - worldY * zoom } };
};

export const ZOOM_STEP = 1.2;

export const fitView = (
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  size: { width: number; height: number },
  { padding = FIT_PADDING, maxZoom = FIT_MAX_ZOOM }: { padding?: number; maxZoom?: number } = {},
): View | null => {
  if (size.width <= 0 || size.height <= 0) return null;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(maxZoom, (size.width - padding * 2) / width, (size.height - padding * 2) / height),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { zoom, panOffset: { x: size.width / 2 - cx * zoom, y: size.height / 2 - cy * zoom } };
};

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

const LINE_PX = 16;
const PAGE_PX = 800;

/**
 * Ctrl/Cmd + wheel (which is also how browsers report a trackpad pinch) zooms; a plain wheel or
 * two-finger scroll pans. Deltas are normalised to pixels whatever `deltaMode` the device reports.
 */
export const wheelIntent = (e: WheelLike): { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number } => {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) return { kind: "zoom", factor: Math.exp(-dy * 0.0015) };
  return { kind: "pan", dx: -dx, dy: -dy };
};

/** Zoom step about the middle of the canvas, for buttons and keyboard. */
export const stepZoom = (view: View, size: { width: number; height: number }, direction: 1 | -1): View =>
  zoomAtPoint(view, { x: size.width / 2, y: size.height / 2 }, direction > 0 ? view.zoom * ZOOM_STEP : view.zoom / ZOOM_STEP);

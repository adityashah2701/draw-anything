/** How dragging snaps to other shapes. A per-viewer preference (like the grid): it is not part of the board. */
export interface SnapSettings {
  /** Master switch for edge, centre, baseline and spacing snapping while dragging. */
  enabled: boolean;
  /** How close, in screen pixels, a line or spacing must be to pull the selection onto it. */
  tolerancePx: number;
  /** Snap to equal spacing between neighbours. */
  spacing: boolean;
  /** Show live distances to the nearest neighbours while dragging. */
  distances: boolean;
}

export const MIN_TOLERANCE_PX = 1;
export const MAX_TOLERANCE_PX = 24;

export const DEFAULT_SNAP_SETTINGS: SnapSettings = { enabled: true, tolerancePx: 6, spacing: true, distances: true };

const clampTolerance = (n: number) => Math.min(MAX_TOLERANCE_PX, Math.max(MIN_TOLERANCE_PX, Math.round(n)));

/** Anything read back from storage (or the UI) turned into valid settings; unknown or broken fields fall back to the defaults. */
export const normalizeSnapSettings = (raw: unknown): SnapSettings => {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (key: keyof SnapSettings) => (typeof value[key] === "boolean" ? (value[key] as boolean) : (DEFAULT_SNAP_SETTINGS[key] as boolean));
  const tolerance = typeof value.tolerancePx === "number" && Number.isFinite(value.tolerancePx) ? clampTolerance(value.tolerancePx) : DEFAULT_SNAP_SETTINGS.tolerancePx;
  return { enabled: bool("enabled"), tolerancePx: tolerance, spacing: bool("spacing"), distances: bool("distances") };
};

/** The world distance that tolerance reaches at `zoom`: a screen distance, so it feels the same at every zoom. */
export const snapThreshold = (settings: Pick<SnapSettings, "tolerancePx">, zoom: number) => settings.tolerancePx / Math.max(zoom, 1e-6);

/** Holding Alt (Option) turns snapping off for the gesture in progress. */
export const isSnapSuppressed = (event: { altKey: boolean }) => event.altKey;

const KEY = "draw-anything:snap:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage can throw on access
  }
};

/** Best effort: private windows and blocked storage just give the defaults. */
export const loadSnapSettings = (storage: StorageLike | null = defaultStorage()): SnapSettings => {
  try {
    const raw = storage?.getItem(KEY);
    return normalizeSnapSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SNAP_SETTINGS;
  }
};

export const saveSnapSettings = (settings: SnapSettings, storage: StorageLike | null = defaultStorage()) => {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // quota or privacy mode: the setting still applies for this session
  }
};

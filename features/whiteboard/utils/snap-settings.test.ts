import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNAP_SETTINGS,
  MAX_TOLERANCE_PX,
  MIN_TOLERANCE_PX,
  isSnapSuppressed,
  loadSnapSettings,
  normalizeSnapSettings,
  saveSnapSettings,
  snapThreshold,
} from "./snap-settings";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("normalizeSnapSettings", () => {
  it("gives the defaults for nothing or junk", () => {
    for (const bad of [undefined, null, 5, "x", [], {}]) expect(normalizeSnapSettings(bad)).toEqual(DEFAULT_SNAP_SETTINGS);
  });

  it("keeps valid fields and clamps the tolerance to what is usable", () => {
    expect(normalizeSnapSettings({ enabled: false, tolerancePx: 10, spacing: false, distances: false })).toEqual({ enabled: false, tolerancePx: 10, spacing: false, distances: false });
    expect(normalizeSnapSettings({ tolerancePx: 0 }).tolerancePx).toBe(MIN_TOLERANCE_PX);
    expect(normalizeSnapSettings({ tolerancePx: 500 }).tolerancePx).toBe(MAX_TOLERANCE_PX);
    expect(normalizeSnapSettings({ tolerancePx: 7.6 }).tolerancePx).toBe(8);
  });

  it("ignores fields of the wrong type one by one", () => {
    expect(normalizeSnapSettings({ enabled: "no", tolerancePx: "9", spacing: false })).toEqual({ ...DEFAULT_SNAP_SETTINGS, spacing: false });
    expect(normalizeSnapSettings({ tolerancePx: Number.NaN }).tolerancePx).toBe(DEFAULT_SNAP_SETTINGS.tolerancePx);
  });
});

describe("snapThreshold", () => {
  it("is a screen distance: the same pixels reach further in the world when zoomed out", () => {
    expect(snapThreshold({ tolerancePx: 6 }, 1)).toBe(6);
    expect(snapThreshold({ tolerancePx: 6 }, 0.5)).toBe(12);
    expect(snapThreshold({ tolerancePx: 6 }, 4)).toBe(1.5);
    expect(Number.isFinite(snapThreshold({ tolerancePx: 6 }, 0))).toBe(true);
  });
});

describe("snap modifier", () => {
  it("Alt suppresses snapping and nothing else does", () => {
    expect(isSnapSuppressed({ altKey: true })).toBe(true);
    expect(isSnapSuppressed({ altKey: false })).toBe(false);
  });
});

describe("persistence", () => {
  it("round-trips through storage", () => {
    const storage = memory();
    saveSnapSettings({ enabled: false, tolerancePx: 12, spacing: true, distances: false }, storage);
    expect(loadSnapSettings(storage)).toEqual({ enabled: false, tolerancePx: 12, spacing: true, distances: false });
  });

  it("repairs a stored value that was edited by hand or came from another version", () => {
    const storage = memory();
    storage.setItem("draw-anything:snap:v1", JSON.stringify({ tolerancePx: 99, extra: 1 }));
    expect(loadSnapSettings(storage)).toEqual({ ...DEFAULT_SNAP_SETTINGS, tolerancePx: MAX_TOLERANCE_PX });
    storage.setItem("draw-anything:snap:v1", "{not json");
    expect(loadSnapSettings(storage)).toEqual(DEFAULT_SNAP_SETTINGS);
  });

  it("never throws when storage is missing, full or blocked", () => {
    expect(loadSnapSettings(null)).toEqual(DEFAULT_SNAP_SETTINGS);
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadSnapSettings(blocked)).toEqual(DEFAULT_SNAP_SETTINGS);
    expect(() => saveSnapSettings(DEFAULT_SNAP_SETTINGS, blocked)).not.toThrow();
    expect(() => saveSnapSettings(DEFAULT_SNAP_SETTINGS, null)).not.toThrow();
  });
});

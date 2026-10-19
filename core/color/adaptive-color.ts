import { tint } from "./named-colors";
export const getAdaptiveColor = (color: string | undefined, isDark: boolean): string => {
  if (!color) return isDark ? "#ffffff" : "#000000";
  const c = color.toLowerCase();

  if (isDark) {
    if (c === "#000000" || c === "black" || c === "#1e293b" || c === "#111318") {
      return "#ffffff";
    }
  } else {
    if (c === "#ffffff" || c === "white" || c === "#f8fafc") {
      return "#000000";
    }
  }
  return color;
};

const luminance = (hex: string) => {
  const channel = (offset: number) => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

/** Relative luminance at which a colour has about 4.5:1 contrast against the dark canvas (oklch 0.13, roughly #0d0d0d). */
const MIN_LUMINANCE_ON_DARK = 0.2;

/**
 * A glyph or caption with no box behind it must read on the dark canvas. Lightens a `#rrggbb` colour toward
 * white only as far as needed; anything else, and colours that already read, come back unchanged.
 */
export const readableOnDark = (color: string): string => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  for (let amount = 0; amount <= 0.9; amount += 0.1) {
    const candidate = amount === 0 ? color : tint(color, amount);
    if (luminance(candidate) >= MIN_LUMINANCE_ON_DARK) return candidate;
  }
  return tint(color, 0.9);
};

/** Luminance below which a fill is a dark surface: a glyph on it needs `readableOnDark` like one on the dark canvas. */
const DARK_SURFACE_LUMINANCE = 0.18;

/** True when `color` is a `#rrggbb` dark enough that dark glyphs would not read on it. Anything else is not "dark". */
export const isDarkSurface = (color: string | undefined): boolean =>
  !!color && /^#[0-9a-f]{6}$/i.test(color) && luminance(color) < DARK_SURFACE_LUMINANCE;

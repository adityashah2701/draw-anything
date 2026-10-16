const NAMED: Record<string, string> = {
  red: "#dc2626",
  orange: "#ea580c",
  yellow: "#ca8a04",
  green: "#16a34a",
  teal: "#0d9488",
  blue: "#2563eb",
  indigo: "#4f46e5",
  purple: "#7c3aed",
  pink: "#db2777",
  gray: "#475569",
  grey: "#475569",
  black: "#111827",
};

/** A colour name or #rgb / #rrggbb as lowercase #rrggbb; anything else (including CSS functions) is rejected. */
export const normalizeColor = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : undefined;
};

/** `hex` mixed with white; `amount` is the share of white (0 = hex, 1 = white). */
export const tint = (hex: string, amount: number): string => {
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
};

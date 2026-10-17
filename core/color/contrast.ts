/** WCAG contrast for the `oklch(L C h [/ a])` values the theme tokens are written in. */

const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Linear-light-correct OKLCH -> sRGB (0..1 per channel), alpha kept. Returns null for anything else. */
export const parseOklch = (value: string): Rgba | null => {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/i.exec(value.trim());
  if (!m) return null;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = m[5] === undefined ? 1 : Number(m[5]) / (m[6] ? 100 : 1);
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ].map((c) => clamp01(linearToSrgb(clamp01(c))));
  return { r: lin[0], g: lin[1], b: lin[2], a };
};

/** `top` painted over an opaque `bottom`. */
export const over = (top: Rgba, bottom: Rgba): Rgba => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});

const luminance = ({ r, g, b }: Rgba) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** WCAG 2.x ratio, 1..21. Translucent colours are composited over `backdrop` first. */
export const contrastRatio = (fg: Rgba, bg: Rgba, backdrop: Rgba = bg): number => {
  const base = over(bg, backdrop);
  const hi = Math.max(luminance(over(fg, base)), luminance(base));
  const lo = Math.min(luminance(over(fg, base)), luminance(base));
  return (hi + 0.05) / (lo + 0.05);
};

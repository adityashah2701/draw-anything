import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseOklch } from "./contrast";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Custom properties declared in the first top-level block that starts with `selector`. */
const tokens = (selector: string): Record<string, string> => {
  const start = css.indexOf(`\n${selector} {`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};

const themes = { light: { ...tokens(":root") }, dark: { ...tokens(":root"), ...tokens(".dark") } };

const color = (theme: Record<string, string>, name: string) => {
  const parsed = parseOklch(theme[name] ?? "");
  if (!parsed) throw new Error(`token --${name} is missing or not oklch`);
  return parsed;
};
const ratio = (theme: Record<string, string>, fg: string, bg: string) =>
  contrastRatio(color(theme, fg), color(theme, bg), color(theme, "background"));

// [foreground, background, minimum]: 4.5 for text, 3 for UI outlines and large text (WCAG 1.4.3, 1.4.11).
const PAIRS: Array<[string, string, number]> = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["text-secondary", "surface", 4.5],
  ["text-secondary", "surface-secondary", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "card", 4.5],
  ["ring", "background", 3],
  ["ring", "card", 3],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5],
  // The two roles that carry meaning: ink (primary) and markup (agent).
  ["agent", "background", 3],
  ["agent", "card", 3],
  ["agent-foreground", "agent", 4.5],
  ["success", "background", 3],
  ["warning", "background", 3],
  ["muted-foreground", "sidebar", 4.5],
  ["primary", "background", 4.5],
  ["input", "background", 1.3],
];

describe.each(Object.entries(themes))("%s theme contrast", (_name, theme) => {
  it.each(PAIRS)("--%s on --%s is at least %s:1 where it is not decorative", (fg, bg, min) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colours", () => {
    const black = parseOklch("oklch(0 0 0)")!;
    const white = parseOklch("oklch(1 0 0)")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
  it("composites translucent colours over the backdrop", () => {
    const veil = parseOklch("oklch(1 0 0 / 12%)")!;
    const dark = parseOklch("oklch(0.13 0 0)")!;
    expect(contrastRatio(veil, dark)).toBeGreaterThan(1);
    expect(contrastRatio(veil, dark)).toBeLessThan(2);
  });
  it("rejects other syntaxes", () => {
    expect(parseOklch("#fff")).toBeNull();
  });
});

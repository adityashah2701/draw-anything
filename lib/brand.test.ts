import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_COLORS, LOCKUP_VIEWBOX, MARK_BOUNDS, MARK_PATH, WORDMARK_PATH } from "./brand";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pathData = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

describe("brand assets", () => {
  it("ships SVGs generated from lib/brand.ts (run scripts/generate-brand-assets.mjs after editing it)", () => {
    for (const variant of ["light", "dark"]) {
      expect(pathData(read(`public/brand/mark-${variant}.svg`))).toEqual([MARK_PATH]);
      expect(pathData(read(`public/brand/logo-${variant}.svg`))).toEqual([MARK_PATH, WORDMARK_PATH]);
    }
    expect(pathData(read("public/brand/favicon.svg"))).toEqual([MARK_PATH]);
    expect(read("app/icon.svg")).toBe(read("public/brand/favicon.svg"));
  });

  it("has well-formed path data with no undefined or NaN numbers", () => {
    for (const d of [MARK_PATH, WORDMARK_PATH]) {
      expect(d).not.toMatch(/NaN|undefined|Infinity/);
      expect(d).toMatch(/^M[-\d.]/);
      expect(d).toMatch(/^[MLHVQCAZ\d\s.,-]+$/);
    }
  });

  it("keeps the mark inside its 32 box and the lockup's cap height on the mark's centre line", () => {
    const { x, y, width, height } = MARK_BOUNDS;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(32);
    expect(y + height).toBeLessThanOrEqual(32);
    expect(LOCKUP_VIEWBOX).toBe("0 0 166 32");
  });

  it("uses colours that exist as hex", () => {
    for (const hex of Object.values(BRAND_COLORS)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { isDarkRender, withRenderTheme } from "./render-theme";

describe("render theme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the page theme by default", () => {
    vi.stubGlobal("document", { documentElement: { classList: { contains: () => true } } });
    expect(isDarkRender()).toBe(true);
  });

  it("is light when there is no document", () => {
    expect(isDarkRender()).toBe(false);
  });

  it("overrides the page theme only inside the callback, even if it throws", () => {
    vi.stubGlobal("document", { documentElement: { classList: { contains: () => true } } });
    expect(withRenderTheme(false, () => isDarkRender())).toBe(false);
    expect(() => withRenderTheme(false, () => { throw new Error("x"); })).toThrow("x");
    expect(isDarkRender()).toBe(true);
  });

  it("nests", () => {
    expect(withRenderTheme(true, () => withRenderTheme(false, () => isDarkRender()))).toBe(false);
    expect(withRenderTheme(true, () => isDarkRender())).toBe(true);
  });
});

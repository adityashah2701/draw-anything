import { describe, expect, it } from "vitest";
import { withRenderTheme } from "@/core/theme/render-theme";
import { resolveTextColor } from "./shape-label-renderer";

describe("resolveTextColor", () => {
  it("keeps a label colour that reads well on its fill", () => {
    withRenderTheme(false, () => expect(resolveTextColor("#1e3a8a", "#dbeafe")).toBe("#1e3a8a"));
  });
  it("replaces a mid-tone label colour that is below 4.5:1 on its fill", () => {
    // #3b82f6 on #dbeafe is about 3:1: readable as a graphic, not as text.
    withRenderTheme(false, () => expect(resolveTextColor("#3b82f6", "#dbeafe")).toBe("#0f172a"));
  });
  it("picks light text on a dark fill", () => {
    withRenderTheme(false, () => expect(resolveTextColor("#475569", "#0f172a")).toBe("#f8fafc"));
  });
});

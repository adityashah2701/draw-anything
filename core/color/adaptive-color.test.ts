import { describe, expect, it } from "vitest";
import { getAdaptiveColor, readableOnDark } from "./adaptive-color";

describe("readableOnDark", () => {
  it("lightens a dark colour until it reads, keeping its hue family", () => {
    const out = readableOnDark("#334155");
    expect(out).not.toBe("#334155");
    expect(Number.parseInt(out.slice(1, 3), 16)).toBeGreaterThan(0x33);
  });

  it("leaves a colour that already reads, and anything that is not #rrggbb", () => {
    expect(readableOnDark("#f97316")).toBe("#f97316");
    expect(readableOnDark("rebeccapurple")).toBe("rebeccapurple");
    expect(readableOnDark("#fff")).toBe("#fff");
  });

  it("turns black into something light", () => {
    expect(readableOnDark("#000000")).not.toBe("#000000");
  });
});

describe("getAdaptiveColor", () => {
  it("swaps black and white for the theme", () => {
    expect(getAdaptiveColor("#000000", true)).toBe("#ffffff");
    expect(getAdaptiveColor("#ffffff", false)).toBe("#000000");
    expect(getAdaptiveColor("#ff0000", true)).toBe("#ff0000");
  });
});

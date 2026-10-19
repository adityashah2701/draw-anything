import { describe, expect, it } from "vitest";
import { CORNER_RADIUS_LIMITS, ICON_SIZE_LIMITS, mergeNodeStyle, normalizeNodeStyle } from "./style";

describe("normalizeNodeStyle", () => {
  it("keeps valid fields", () => {
    const style = { iconHidden: true, iconSize: 32, iconPlacement: "top", iconColor: "#2563EB", cornerRadius: 12, originalIcon: "database" };
    expect(normalizeNodeStyle(style)).toEqual({ ...style, iconColor: "#2563eb" });
  });

  it.each([undefined, null, 5, "x", [], [1, 2]])("treats %j as no style", (value) => {
    expect(normalizeNodeStyle(value)).toEqual({});
  });

  it("drops fields of the wrong type or shape instead of trusting them", () => {
    expect(
      normalizeNodeStyle({
        iconHidden: "yes",
        iconSize: "big",
        iconPlacement: "diagonal",
        iconColor: "red",
        cornerRadius: Number.NaN,
        originalIcon: "",
        extra: 1,
      }),
    ).toEqual({});
    expect(normalizeNodeStyle({ iconHidden: false })).toEqual({});
    expect(normalizeNodeStyle({ iconSize: Infinity, cornerRadius: -Infinity })).toEqual({});
  });

  it("clamps numbers into their limits", () => {
    expect(normalizeNodeStyle({ iconSize: 1, cornerRadius: -5 })).toEqual({ iconSize: ICON_SIZE_LIMITS.min, cornerRadius: CORNER_RADIUS_LIMITS.min });
    expect(normalizeNodeStyle({ iconSize: 5000, cornerRadius: 5000 })).toEqual({ iconSize: ICON_SIZE_LIMITS.max, cornerRadius: CORNER_RADIUS_LIMITS.max });
  });

  it("keeps null as the original icon (it showed its kind's icon)", () => {
    expect(normalizeNodeStyle({ originalIcon: null })).toEqual({ originalIcon: null });
    expect(mergeNodeStyle(undefined, { originalIcon: null })).toEqual({ originalIcon: null });
    expect(mergeNodeStyle({ originalIcon: null }, { originalIcon: undefined })).toBeUndefined();
  });

  it("rejects an absurdly long original icon id", () => {
    expect(normalizeNodeStyle({ originalIcon: "x".repeat(65) })).toEqual({});
  });
});

describe("mergeNodeStyle", () => {
  it("sets fields and keeps the others", () => {
    expect(mergeNodeStyle({ iconSize: 32 }, { iconPlacement: "left" })).toEqual({ iconSize: 32, iconPlacement: "left" });
  });

  it("an undefined value clears the field", () => {
    expect(mergeNodeStyle({ iconSize: 32, iconPlacement: "top" }, { iconSize: undefined })).toEqual({ iconPlacement: "top" });
  });

  it("returns undefined when nothing non-default is left, so a reset node is stored like a never-styled one", () => {
    expect(mergeNodeStyle({ iconSize: 32 }, { iconSize: undefined })).toBeUndefined();
    expect(mergeNodeStyle(undefined, {})).toBeUndefined();
    expect(mergeNodeStyle({ iconHidden: true }, { iconHidden: false })).toBeUndefined();
  });

  it("repairs bad stored data on the way through", () => {
    expect(mergeNodeStyle({ iconSize: "huge", iconPlacement: "top" }, { cornerRadius: 4 })).toEqual({ iconPlacement: "top", cornerRadius: 4 });
  });
});

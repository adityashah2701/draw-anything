import { describe, expect, it } from "vitest";
import { normalizeColor, tint } from "./named-colors";

describe("normalizeColor", () => {
  it.each([
    ["blue", "#2563eb"],
    ["  BLUE ", "#2563eb"],
    ["grey", "#475569"],
    ["#FA0", "#ffaa00"],
    ["#ABCDEF", "#abcdef"],
    ["#abcdef", "#abcdef"],
  ])("%j -> %s", (input, expected) => expect(normalizeColor(input)).toBe(expected));

  it.each(["", "nope", "#12345", "#1234567", "#ggg", "rgb(1,2,3)", "url(x)", "red; x", 'red"', 5, null, undefined, {}])(
    "rejects %j",
    (input) => expect(normalizeColor(input)).toBeUndefined(),
  );
});

describe("tint", () => {
  it("mixes with white by the given share", () => {
    expect(tint("#000000", 0)).toBe("#000000");
    expect(tint("#000000", 1)).toBe("#ffffff");
    expect(tint("#000000", 0.5)).toBe("#808080");
    expect(tint("#2563eb", 0.88)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is a light fill that keeps the hue", () => {
    const light = tint("#2563eb", 0.88);
    const channel = (i: number) => Number.parseInt(light.slice(1 + i * 2, 3 + i * 2), 16);
    expect(Math.min(channel(0), channel(1), channel(2))).toBeGreaterThan(200);
    expect(channel(2)).toBeGreaterThan(channel(0)); // still bluish
  });
});

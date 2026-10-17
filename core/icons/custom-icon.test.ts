import { describe, expect, it } from "vitest";
import { validateCustomIcon } from "./custom-icon";
import { iconForNode } from "./registry";

const good = {
  id: "custom-abc",
  title: "Mine",
  paths: ["M0 0h10v10H0Z"],
  viewBox: { width: 24, height: 24 },
  style: "logo",
  color: "#112233",
};

describe("validateCustomIcon", () => {
  it("accepts a well-formed icon and fills defaults", () => {
    const icon = validateCustomIcon(good)!;
    expect(icon.id).toBe("custom-abc");
    expect(icon.color).toBe("#112233");
    expect(icon.badge).toBe("MIN");
    expect(validateCustomIcon({ ...good, color: "red", style: "nope" })).toMatchObject({ color: "#1f2937", style: "logo" });
  });

  it.each([
    ["null", null],
    ["a string", "M0 0"],
    ["a registry-looking id", { ...good, id: "database" }],
    ["markup in path data", { ...good, paths: ['M0 0"/><script>alert(1)</script>'] }],
    ["a path that does not start with a move", { ...good, paths: ["L1 1"] }],
    ["no paths", { ...good, paths: [] }],
    ["too many paths", { ...good, paths: Array(65).fill("M0 0") }],
    ["one huge path", { ...good, paths: [`M0 0${" 1".repeat(11_000)}`] }],
    ["too much path data in total", { ...good, paths: [`M0 0${" 1".repeat(6_000)}`, `M0 0${" 1".repeat(6_000)}`] }],
    ["a zero viewBox", { ...good, viewBox: { width: 0, height: 24 } }],
    ["a huge viewBox", { ...good, viewBox: { width: 1e9, height: 24 } }],
    ["a non-numeric viewBox", { ...good, viewBox: { width: "24", height: 24 } }],
  ])("rejects %s", (_name, value) => {
    expect(validateCustomIcon(value)).toBeNull();
  });
});

describe("custom icons on nodes", () => {
  it("iconForNode prefers a valid customIcon and falls back when it is damaged", () => {
    expect(iconForNode({ icon: "database", customIcon: good }).id).toBe("custom-abc");
    expect(iconForNode({ icon: "database", customIcon: { ...good, paths: ["<x>"] } }).id).toBe("database");
  });
});

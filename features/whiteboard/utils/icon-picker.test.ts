import { describe, expect, it } from "vitest";
import { getIcon } from "@/core/icons/registry";
import { validateCustomIcon } from "@/core/icons/custom-icon";
import { buildIconNode, iconCategories, iconTitle, moveGridIndex, pickerIcons } from "./icon-picker";

describe("pickerIcons", () => {
  it("lists every icon by title when there is no query", () => {
    const titles = pickerIcons("", null).map(iconTitle);
    expect(titles.length).toBeGreaterThan(20);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });
  it("finds a logo by its title and a neutral icon by its alias in the same search", () => {
    const ids = pickerIcons("postgres", null).map((i) => i.id);
    expect(ids).toContain("database");
    expect(ids).toContain("logo-postgresql");
  });
  it("puts the user's own icons first and gives them their own tab", () => {
    const mine = validateCustomIcon({ id: "custom-x", title: "Gizmo", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 } })!;
    expect(pickerIcons("", null, [mine])[0].id).toBe("custom-x");
    expect(pickerIcons("", "custom", [mine]).map((i) => i.id)).toEqual(["custom-x"]);
    expect(pickerIcons("gizmo", null, [mine]).map((i) => i.id)).toEqual(["custom-x"]);
    expect(pickerIcons("", "data", [mine]).some((i) => i.id === "custom-x")).toBe(false);
  });
  it("finds an icon through an alias", () => {
    expect(pickerIcons("k8s", null).map((i) => i.id)).toContain("kubernetes");
  });
  it("narrows by category, with or without a query", () => {
    const [category] = iconCategories();
    expect(pickerIcons("", category).every((i) => i.category === category)).toBe(true);
    expect(pickerIcons("server", "devops").every((i) => i.category === "devops")).toBe(true);
  });
  it("returns nothing for junk", () => {
    expect(pickerIcons("zzqqxx-no-such-icon", null)).toEqual([]);
  });
});

describe("moveGridIndex", () => {
  it("moves by one and by row, and stops at the edges", () => {
    expect(moveGridIndex(0, "ArrowLeft", 4, 10)).toBe(0);
    expect(moveGridIndex(9, "ArrowRight", 4, 10)).toBe(9);
    expect(moveGridIndex(1, "ArrowDown", 4, 10)).toBe(5);
    expect(moveGridIndex(7, "ArrowDown", 4, 10)).toBe(7); // no row below column 3 of the last partial row
    expect(moveGridIndex(5, "ArrowUp", 4, 10)).toBe(1);
    expect(moveGridIndex(2, "ArrowUp", 4, 10)).toBe(2);
    expect(moveGridIndex(3, "End", 4, 10)).toBe(9);
    expect(moveGridIndex(3, "Home", 4, 10)).toBe(0);
    expect(moveGridIndex(0, "End", 4, 0)).toBe(-1);
  });
});

describe("buildIconNode", () => {
  it("is a semantic node centred on the point whose icon resolves", () => {
    const node = buildIconNode(getIcon("kubernetes"), { x: 100, y: 50 }, "n1");
    expect(node.type).toBe("semantic-node");
    expect(node.ai?.icon).toBe("kubernetes");
    const [a, b] = node.points;
    expect((a.x + b.x) / 2).toBe(100);
    expect((a.y + b.y) / 2).toBe(50);
    expect(b.x - a.x).toBeGreaterThanOrEqual(140);
  });
  it("stores a custom icon inside the element, without undefined fields", () => {
    const mine = validateCustomIcon({ id: "custom-x", title: "Gizmo", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 } })!;
    const node = buildIconNode(mine, { x: 0, y: 0 }, "n2");
    expect(node.ai?.icon).toBeUndefined();
    expect(node.ai?.customIcon?.id).toBe("custom-x");
    expect(JSON.parse(JSON.stringify(node.ai?.customIcon))).toEqual(node.ai?.customIcon);
    expect(node.label).toBe("Gizmo");
  });
});

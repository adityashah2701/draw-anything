import { beforeAll, describe, expect, it } from "vitest";
import { getIcon } from "@/core/icons/registry";
import { validateCustomIcon } from "@/core/icons/custom-icon";
import { categoryTint, loadIconLibrary } from "@/core/icons/registry";
import {
  buildIconElement,
  DEFAULT_ICON_SIZE,
  iconCategories,
  iconTitle,
  isCustomIcon,
  MAX_RECENT_ICONS,
  moveGridIndex,
  pickerIcons,
  recentIcons,
  storedCustomIcon,
  withRecentIcon,
} from "./icon-picker";

describe("pickerIcons", () => {
  beforeAll(loadIconLibrary);

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

describe("buildIconElement", () => {
  beforeAll(loadIconLibrary);

  it("is a standalone icon, not a node: no label, no fill, centred on the point", () => {
    const el = buildIconElement(getIcon("kubernetes"), { x: 100, y: 50 }, "n1");
    expect(el.type).toBe("icon");
    expect(el.ai?.icon).toBe("kubernetes");
    expect(el.label).toBeUndefined();
    expect(el.fill).toBeUndefined();
    const [a, b] = el.points;
    expect([(a.x + b.x) / 2, (a.y + b.y) / 2]).toEqual([100, 50]);
    expect(b.x - a.x).toBe(DEFAULT_ICON_SIZE);
    expect(b.y - a.y).toBe(DEFAULT_ICON_SIZE);
  });

  it("starts a line icon in its category colour and a logo in its own", () => {
    expect(buildIconElement(getIcon("database"), { x: 0, y: 0 }, "a").color).toBe(categoryTint("data"));
    expect(buildIconElement(getIcon("logo-docker"), { x: 0, y: 0 }, "b").color).toBe(getIcon("logo-docker").color);
  });

  it("stores a custom icon inside the element, without undefined fields", () => {
    const mine = validateCustomIcon({ id: "custom-x", title: "Gizmo", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 } })!;
    const el = buildIconElement(mine, { x: 0, y: 0 }, "n2");
    expect(el.ai?.icon).toBeUndefined();
    expect(el.ai?.customIcon?.id).toBe("custom-x");
    expect(JSON.parse(JSON.stringify(el.ai?.customIcon))).toEqual(el.ai?.customIcon);
    expect(el.label).toBeUndefined();
  });
});

describe("recently used icons", () => {
  beforeAll(loadIconLibrary);

  it("moves a re-picked icon to the front without repeating it, and keeps a bounded list", () => {
    expect(withRecentIcon(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(withRecentIcon([], "x")).toEqual(["x"]);
    const many = Array.from({ length: 30 }, (_, i) => `i${i}`);
    expect(withRecentIcon(many, "new")).toHaveLength(MAX_RECENT_ICONS);
    expect(withRecentIcon(many, "new")[0]).toBe("new");
  });

  it("resolves ids to icons in order, dropping ones that no longer exist", () => {
    const mine = validateCustomIcon({ id: "custom-x", title: "Gizmo", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 } })!;
    expect(recentIcons(["queue", "gone", "custom-x", "database"], [mine]).map((i) => i.id)).toEqual(["queue", "custom-x", "database"]);
    expect(recentIcons([], [mine])).toEqual([]);
  });
});

describe("custom icons stored in elements", () => {
  it("storedCustomIcon keeps only the fields the icon has, so storage JSON never holds undefined", () => {
    const bare = validateCustomIcon({ id: "custom-a", title: "A", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 }, style: "stroke" })!;
    const stored = storedCustomIcon(bare);
    expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    expect(Object.values(stored).includes(undefined as never)).toBe(false);
    expect(isCustomIcon(bare)).toBe(true);
    expect(isCustomIcon(getIcon("database"))).toBe(false);
  });
});

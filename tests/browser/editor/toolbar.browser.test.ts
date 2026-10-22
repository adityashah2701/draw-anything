import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

suite("drawing toolbar in the real editor", () => {
  let s: EditorSession;
  const rail = () => s.page.getByRole("navigation", { name: "Drawing tools" });
  const group = (id: string) => s.page.locator(`[data-toolbar-group="${id}"]`);
  beforeEach(async () => {
    s = await openEditor();
  });
  afterEach(async () => {
    await s?.close();
  });

  it("keeps the rail short: a handful of buttons instead of one per tool", async () => {
    const buttons = await rail().getByRole("button").count();
    expect(buttons).toBeLessThanOrEqual(10);
    expect(await group("shapes").getAttribute("aria-label")).toBe("Rectangle");
    // Lower-frequency shapes are not on the rail.
    for (const name of ["Triangle", "Terminator", "Frame", "Line", "Bi-Arrow", "Eraser", "Insert icon"]) expect(await rail().getByRole("button", { name, exact: true }).count()).toBe(0);
    await s.screenshot("toolbar-rail");
  });

  it("selects a group's tool on click, then opens the rest on a second click", async () => {
    await group("shapes").click();
    expect(await s.tool()).toBe("rectangle");
    await group("shapes").click();
    const menu = s.page.getByRole("menu");
    await menu.waitFor();
    expect(await menu.getByRole("menuitem").allInnerTexts()).toEqual(expect.arrayContaining([expect.stringContaining("Triangle"), expect.stringContaining("Terminator")]));
    await s.screenshot("toolbar-shapes-flyout");
    await menu.getByRole("menuitem", { name: /^Triangle/ }).click();
    expect(await s.tool()).toBe("triangle");
    await menu.waitFor({ state: "detached" });
    // The group now shows, and remembers, the shape just chosen.
    expect(await group("shapes").getAttribute("aria-label")).toBe("Triangle");
    await s.press("v");
    expect(await s.tool()).toBe("select");
    expect(await group("shapes").getAttribute("aria-label")).toBe("Triangle");
    await group("shapes").click();
    expect(await s.tool()).toBe("triangle");
  });

  it("opens a flyout with the context menu and with the arrow keys, and Escape returns focus", async () => {
    await group("connectors").click({ button: "right" });
    const menu = s.page.getByRole("menu");
    await menu.waitFor();
    expect(await menu.getByRole("menuitem").count()).toBe(3);
    await s.page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    await group("connectors").focus();
    await s.page.keyboard.press("ArrowRight");
    await menu.waitFor();
    // Opening by keyboard lands on the first item; one step down is the second.
    await expect.poll(() => s.page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
    await s.page.keyboard.press("ArrowDown");
    await expect.poll(() => s.page.evaluate(() => document.activeElement?.textContent)).toBe("Bi-Arrow");
    await s.page.keyboard.press("Enter");
    expect(await s.tool()).toBe("arrow-bidirectional");
  });

  it("the Insert group opens the icon picker without changing the tool", async () => {
    await group("insert").click({ button: "right" });
    await s.page.getByRole("menuitem", { name: /^Icon/ }).click();
    await s.page.getByRole("textbox", { name: "Search icons" }).waitFor();
    expect(await s.tool()).toBe("select");
  });

  it("Enter on a focused group button picks its tool instead of opening the menu", async () => {
    await group("draw").focus();
    await s.page.keyboard.press("Enter");
    expect(await s.tool()).toBe("freehand");
    expect(await s.page.getByRole("menu").count()).toBe(0);
  });

  it("follows keyboard shortcuts: the group shows the tool the shortcut activated", async () => {
    await s.press("d");
    expect(await group("shapes").getAttribute("aria-label")).toBe("Diamond");
    expect(await group("shapes").getAttribute("aria-pressed")).toBe("true");
    await s.press("a");
    expect(await group("connectors").getAttribute("aria-pressed")).toBe("true");
    expect(await group("shapes").getAttribute("aria-pressed")).toBe("false");
    await s.press("o");
    expect(await group("shapes").getAttribute("aria-label")).toBe("Frame");
    await s.press("t");
    expect(await group("insert").getAttribute("aria-label")).toBe("Text");
    await s.press("e");
    expect(await group("draw").getAttribute("aria-label")).toBe("Eraser");
  });

  it("tooltips name the tool, its shortcut and how to reach the rest", async () => {
    await group("shapes").hover();
    const tip = s.page.getByRole("tooltip");
    await tip.waitFor();
    const text = await tip.innerText();
    expect(text).toContain("Rectangle");
    expect(text).toContain("R");
    expect(text).toMatch(/more/i);
  });

  it("renders in dark mode", async () => {
    await s.close();
    s = await openEditor({ dark: true });
    await group("shapes").click();
    await group("shapes").click();
    await s.page.getByRole("menu").waitFor();
    await s.screenshot("toolbar-shapes-flyout-dark");
  });

  it("draws with a shape picked from a flyout", async () => {
    await s.pickTool("Terminator");
    expect(await s.tool()).toBe("pill");
    await s.drag({ x: 300, y: 300 }, { x: 460, y: 360 });
    expect((await s.elements()).filter((e) => e.type === "pill")).toHaveLength(1);
    expect(s.problems).toEqual([]);
  });
});

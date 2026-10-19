import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";
import { byId, connector, rect, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

const text = (id: string, x: number, y: number, fontSize = 24): El => ({
  id,
  type: "text",
  text: "Hello",
  fontSize,
  fontWeight: "400",
  fontStyle: "normal",
  color: "#1f2937",
  strokeWidth: 1,
  points: [{ x, y }],
});

const icon = (id: string, x: number, y: number): El => ({
  id,
  type: "icon",
  points: [
    { x, y },
    { x: x + 64, y: y + 64 },
  ],
  color: "#2563eb",
  strokeWidth: 2,
  ai: { icon: "server" },
});

const board = (): El[] => [
  rect("A", 100, 100, 120, 80, { fill: "#dbeafe" }),
  rect("B", 400, 100, 120, 80, { fill: "#fee2e2", label: "Service", color: "#ef4444", strokeWidth: 4 }),
  connector(),
  rect("C", 250, 320),
  text("T", 700, 120),
  icon("I", 700, 300),
  rect("E", 540, 700, 200, 60),
];

suite("editor properties bar", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never, viewport: { width: 1280, height: 800 } });
  });
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p) && !/willReadFrequently/.test(p))).toEqual([]);
    await s?.close();
  });

  const bar = () => s.page.getByRole("toolbar", { name: "Style properties" });
  const chip = (label: RegExp | string) => bar().getByRole("button", { name: label });
  const chips = async () => (await bar().locator("[data-chip-trigger]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.split(":")[0])));
  const select = async (...ids: string[]) => {
    await s.click({ x: 900, y: 650 }, { space: "screen" });
    for (const [i, id] of ids.entries()) {
      const e = byId(await s.elements(), id);
      const at = { x: e.points[0].x + 20, y: e.points[0].y + 20 };
      if (i > 0) await s.page.keyboard.down("Shift");
      await s.click(at);
      if (i > 0) await s.page.keyboard.up("Shift");
    }
    await s.waitForIdle();
  };
  const el = async (id: string) => byId(await s.elements(), id);
  const popover = (name: string) => s.page.getByRole("dialog", { name, exact: true });

  it("shows nothing without a selection", async () => {
    await expect(bar().count()).resolves.toBe(0);
  });

  it("offers only the sections a rectangle has", async () => {
    await select("C");
    expect(await chips()).toEqual(["Stroke", "Fill", "Corners", "Opacity"]);
    await s.screenshot("bar-rectangle");
  });

  it("offers text size and colour, but no stroke, fill or corners, for text", async () => {
    await select("T");
    expect(await chips()).toEqual(["Text color", "Text", "Opacity"]);
  });

  it("offers colour and width for an icon", async () => {
    await select("I");
    expect(await chips()).toEqual(["Stroke", "Opacity"]);
  });

  it("offers line options for a connector, and no fill", async () => {
    await select("A");
    await s.page.keyboard.up("Shift");
    const c = byId(await s.elements(), "ab");
    await s.click({ x: (c.points[0].x + c.points[c.points.length - 1].x) / 2, y: c.points[0].y });
    await s.waitForIdle();
    expect(await chips()).toEqual(["Stroke", "Line", "Opacity"]);
    await s.screenshot("bar-connector");
  });

  it("changes stroke colour and width of the selection, one undo step each", async () => {
    await select("C");
    await chip(/^Stroke/).click();
    await popover("Stroke").getByRole("button", { name: "Stroke #ef4444" }).click();
    await s.waitForIdle();
    expect((await el("C")).color).toBe("#ef4444");
    await popover("Stroke").getByRole("button", { name: "Stroke width: 8 px" }).click();
    await s.waitForIdle();
    expect((await el("C")).strokeWidth).toBe(8);
    await s.screenshot("bar-stroke-popover");
    await s.page.keyboard.press("Escape");
    await s.press("Control+z");
    await s.waitForIdle();
    expect((await el("C")).strokeWidth).toBe(2);
    expect((await el("C")).color).toBe("#ef4444");
    await s.press("Control+z");
    await s.waitForIdle();
    expect((await el("C")).color).toBe("#1f2937");
    await s.press("Control+Shift+z");
    await s.waitForIdle();
    expect((await el("C")).color).toBe("#ef4444");
  });

  it("sets and removes fill", async () => {
    await select("C");
    await chip(/^Fill/).click();
    await popover("Fill").getByRole("button", { name: "Fill #dcfce7" }).click();
    await s.waitForIdle();
    expect((await el("C")).fill).toBe("#dcfce7");
    await popover("Fill").getByRole("button", { name: "Fill: none" }).click();
    await s.waitForIdle();
    expect((await el("C")).fill).toBeUndefined();
  });

  it("changes the corner radius", async () => {
    await select("C");
    await chip(/^Corners/).click();
    await popover("Corners").getByRole("button", { name: "Corner radius: Round corners" }).click();
    await s.waitForIdle();
    expect((await el("C")).cornerRadius).toBe(16);
  });

  it("changes opacity", async () => {
    await select("C");
    await chip(/^Opacity/).click();
    await popover("Opacity").getByRole("button", { name: "Opacity: 50%" }).click();
    await s.waitForIdle();
    expect((await el("C")).opacity).toBe(0.5);
  });

  it("changes text size and text colour", async () => {
    await select("T");
    await chip(/^Text:/).click();
    await popover("Text").getByRole("button", { name: "Font size: 48 px" }).click();
    await s.waitForIdle();
    expect((await el("T")).fontSize).toBe(48);
    await s.page.keyboard.press("Escape");
    await chip(/^Text color/).click();
    await popover("Text color").getByRole("button", { name: "Text color #3b82f6" }).click();
    await s.waitForIdle();
    expect((await el("T")).color).toBe("#3b82f6");
  });

  it("edits a connector's line style, path and ends", async () => {
    const c = byId(await s.elements(), "ab");
    await s.click({ x: 900, y: 650 }, { space: "screen" });
    await s.click({ x: (c.points[0].x + c.points[c.points.length - 1].x) / 2, y: c.points[0].y });
    await chip(/^Line/).click();
    await popover("Line").getByRole("button", { name: "Line style: Dashed" }).click();
    await s.waitForIdle();
    expect((await el("ab")).dashed).toBe(true);
    await popover("Line").getByRole("button", { name: "Start arrowhead: Arrow" }).click();
    await s.waitForIdle();
    expect((await el("ab")).arrowHeadStart).toBe(true);
    await popover("Line").getByRole("button", { name: "Path: Straight" }).click();
    await s.waitForIdle();
    expect((await el("ab")).routingMode).toBe("straight");
  });

  it("a mixed selection shows mixed values and edits only the shapes a property applies to", async () => {
    await select("A", "B", "T");
    expect(await chips()).toEqual(["Stroke", "Fill", "Corners", "Text", "Opacity"]);
    await expect(chip(/^Stroke/).getAttribute("aria-label")).resolves.toMatch(/mixed/);
    await chip(/^Fill/).click();
    await expect(popover("Fill").getByRole("button", { pressed: true }).count()).resolves.toBe(0);
    await popover("Fill").getByRole("button", { name: "Fill #dcfce7" }).click();
    await s.waitForIdle();
    expect((await el("A")).fill).toBe("#dcfce7");
    expect((await el("B")).fill).toBe("#dcfce7");
    expect((await el("T")).fill).toBeUndefined();
    await s.page.keyboard.press("Escape");
    await chip(/^Text:/).click();
    await popover("Text").getByRole("button", { name: "Font size: 16 px" }).click();
    await s.waitForIdle();
    expect((await el("T")).fontSize).toBe(16);
    expect((await el("B")).fontSize).toBe(16);
    expect((await el("A")).fontSize).toBeUndefined();
    await s.screenshot("bar-mixed");
  });

  it("styles every member of a group", async () => {
    await select("A", "C");
    await s.press("Control+g");
    await s.waitForIdle();
    await expect(bar().getByTestId("properties-title").textContent()).resolves.toContain("Group");
    await chip(/^Stroke/).click();
    await popover("Stroke").getByRole("button", { name: "Stroke #22c55e" }).click();
    await s.waitForIdle();
    expect((await el("A")).color).toBe("#22c55e");
    expect((await el("C")).color).toBe("#22c55e");
  });

  it("does not edit a locked selection", async () => {
    await select("C");
    await s.press("Control+Shift+l");
    await s.waitForIdle();
    await expect(bar().locator("[data-chip-trigger]").first().isDisabled()).resolves.toBe(true);
    await expect(bar().getByTestId("properties-title").textContent()).resolves.toContain("Locked");
  });

  it("is keyboard operable: arrows move between sections, Enter opens, Escape closes and returns focus", async () => {
    await select("C");
    await chip(/^Stroke/).focus();
    await s.page.keyboard.press("ArrowRight");
    await expect(chip(/^Fill/).evaluate((n) => n === document.activeElement)).resolves.toBe(true);
    await s.page.keyboard.press("Enter");
    await popover("Fill").waitFor();
    await expect(s.page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).resolves.toBe(true);
    await s.page.keyboard.press("Escape");
    await expect(popover("Fill").count()).resolves.toBe(0);
    await expect(chip(/^Fill/).evaluate((n) => n === document.activeElement)).resolves.toBe(true);
    expect(await s.selected()).toEqual(["C"]);
  });

  it("typing in a field does not trigger board shortcuts, and Enter commits", async () => {
    await select("C");
    await chip(/^Stroke/).click();
    const field = s.page.getByRole("textbox", { name: "Stroke width in pixels" });
    await field.fill("5");
    await field.press("Enter");
    await s.waitForIdle();
    expect((await el("C")).strokeWidth).toBe(5);
    expect(await s.tool()).toBe("select");
  });

  it("steps back when the selection reaches under it, and not otherwise", async () => {
    await select("C");
    await expect(bar().getAttribute("data-overlaps")).resolves.toBe("false");
    await select("E");
    await expect(bar().getAttribute("data-overlaps")).resolves.toBe("true");
  });

  it("keeps working at zoom and on a narrow screen without overflowing the page", async () => {
    await select("C");
    await s.page.setViewportSize({ width: 390, height: 780 });
    await s.waitForIdle();
    const box = await bar().boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await s.screenshot("bar-narrow");
    await chip(/^Opacity/).scrollIntoViewIfNeeded();
    await chip(/^Opacity/).click();
    const pop = await popover("Opacity").boundingBox();
    expect(pop!.x).toBeGreaterThanOrEqual(0);
    expect(pop!.x + pop!.width).toBeLessThanOrEqual(390);
  });
});

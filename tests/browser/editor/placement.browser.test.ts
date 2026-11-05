import { afterEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";
import { byId, connector, rect, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

/** A board saved before placement stamps existed: nothing carries one. */
const legacy = (): El[] => [rect("A", 100, 100), rect("B", 400, 100), connector(), rect("C", 250, 320)];

suite("who placed what, in the real editor", () => {
  let s: EditorSession;
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p) && !/willReadFrequently/.test(p))).toEqual([]);
    await s?.close();
  });
  const stamp = async (id: string) => (byId(await s.elements(), id) as El).placement;

  it("a legacy board loads with no stamp, and loading writes nothing", async () => {
    s = await openEditor({ elements: legacy() as never });
    for (const id of ["A", "B", "C"]) expect(await stamp(id)).toBeUndefined();
    expect((await s.elements()).some((e) => e.type === ("layout" as never))).toBe(false);
  });

  it("dragging stamps the moved element user, in the same step as the move, and undo and redo restore both together", async () => {
    s = await openEditor({ elements: legacy() as never });
    await s.drag({ x: 160, y: 140 }, { x: 160, y: 260 });
    await s.waitForIdle();
    const moved = byId(await s.elements(), "A");
    expect(moved.points[0].y).toBeGreaterThan(100);
    expect(moved.placement).toBe("user");
    expect(await stamp("B")).toBeUndefined(); // untouched: no stamp written

    await s.press("Control+z");
    await s.waitForIdle();
    const undone = byId(await s.elements(), "A");
    expect(undone.points[0]).toEqual({ x: 100, y: 100 });
    expect(undone.placement).toBeUndefined();

    await s.press("Control+Shift+z");
    await s.waitForIdle();
    const redone = byId(await s.elements(), "A");
    expect(redone.points[0].y).toBeGreaterThan(100);
    expect(redone.placement).toBe("user");
  });

  it("a keyboard nudge and a typed position stamp user too", async () => {
    s = await openEditor({ elements: legacy() as never });
    await s.click({ x: 160, y: 140 });
    await s.press("ArrowRight");
    await s.waitForIdle();
    expect(await stamp("A")).toBe("user");
    await s.click({ x: 460, y: 140 });
    await s.page.evaluate(() => window.__editor.controller!.elementCommands.nudge(0, 30));
    await s.waitForIdle();
    expect(await stamp("B")).toBe("user");
  });

  it("an edit that moves nothing leaves the stamp as it was", async () => {
    const board = legacy();
    board[0].placement = "auto";
    s = await openEditor({ elements: board as never });
    await s.page.evaluate(() => {
      const c = window.__editor.controller!;
      c.handleStyleChange({ color: "#dc2626" }, ["A"]);
    });
    await s.waitForIdle();
    expect(byId(await s.elements(), "A").color).toBe("#dc2626");
    expect(await stamp("A")).toBe("auto");
  });
});

suite("the Layout command, in the real editor", () => {
  let s: EditorSession;
  afterEach(async () => {
    await s?.close();
  });
  const board = (): El[] => [
    rect("a", 100, 100, 140, 70, { placement: "auto", label: "a" }),
    rect("b", 900, 600, 140, 70, { placement: "auto", label: "b" }),
    rect("c", 300, 900, 140, 70, { placement: "user", label: "c" }),
    connector("ab", "a", "b", { points: [{ x: 240, y: 135 }, { x: 900, y: 635 }] }),
    connector("bc", "b", "c", { points: [{ x: 970, y: 670 }, { x: 370, y: 900 }] }),
  ];
  const plan = (mode: string) =>
    s.page.evaluate((mode) => {
      const c = window.__editor.controller!;
      const p = c.planLayout({ mode: mode as never, engine: "architecture" });
      return { moves: p.preview.moves.map((m) => m.id), held: p.preview.stats.heldFixed, hasPatch: p.patch !== null };
    }, mode);

  it("previews without writing, applies as one undo step, and never moves what the person placed", async () => {
    s = await openEditor({ elements: board() as never });
    const before = JSON.stringify(await s.elements());
    const preview = await plan("adjust");
    expect(preview.moves.length).toBeGreaterThan(0);
    expect(preview.moves).not.toContain("c");
    expect(JSON.stringify(await s.elements())).toBe(before); // planning wrote nothing

    const depth = await s.page.evaluate(() => window.__editor.room.undoDepth());
    await s.page.evaluate(() => {
      const c = window.__editor.controller!;
      c.applyLayoutPlan(c.planLayout({ mode: "adjust", engine: "architecture" }));
    });
    await s.waitForIdle();
    const after = await s.elements();
    expect(byId(after, "c").points).toEqual(board()[2].points);
    expect(byId(after, "c").placement).toBe("user");
    expect(JSON.stringify(byId(after, "a").points)).not.toBe(JSON.stringify(board()[0].points));
    expect(byId(after, "a").placement).toBe("auto");
    expect((await s.page.evaluate(() => window.__editor.room.undoDepth())) - depth).toBe(1);

    await s.press("Control+z");
    await s.waitForIdle();
    expect(JSON.stringify(await s.elements())).toBe(before);
  });

  it("opens from the controller, shows the preview over the board and clears it on close", async () => {
    s = await openEditor({ elements: board() as never });
    await s.page.evaluate(() => window.__editor.controller!.setShowLayoutPanel(true));
    const dialog = s.page.getByRole("dialog", { name: "Layout" });
    await dialog.waitFor();
    await dialog.getByLabel("Layout engine").selectOption("architecture");
    await s.page.waitForFunction(() => window.__editor.controller!.layoutPreview !== null);
    expect(await dialog.getByRole("status").innerText()).toMatch(/would move/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await s.page.waitForFunction(() => window.__editor.controller!.layoutPreview === null);
  });

  it("asks before overwriting what the person placed, and applies only after the tick", async () => {
    s = await openEditor({ elements: board() as never });
    await s.page.evaluate(() => window.__editor.controller!.setShowLayoutPanel(true));
    const dialog = s.page.getByRole("dialog", { name: "Layout" });
    await dialog.waitFor();
    await dialog.getByLabel("Layout engine").selectOption("architecture");
    await dialog.getByText("Re-layout everything").click();
    const apply = dialog.getByRole("button", { name: "Apply" });
    await expect(apply.isDisabled()).resolves.toBe(true);
    await dialog.getByRole("checkbox", { name: /I placed by hand/ }).check();
    await expect(apply.isDisabled()).resolves.toBe(false);
    await apply.click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "c").placement).toBe("auto");
  });
});

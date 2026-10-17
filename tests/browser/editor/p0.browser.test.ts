import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;

type El = Record<string, any>;
const labelOf = (e: El | undefined) => e?.label;

suite("editor P0: blank shapes, multiline text, connector snapping", () => {
  let s: EditorSession;
  beforeAll(async () => {
    s = await openEditor();
  });
  afterAll(async () => {
    await s?.close();
  });

  it("a new rectangle is blank", async () => {
    await s.pickTool("r");
    await s.drag({ x: 100, y: 100 }, { x: 260, y: 200 });
    const rect = (await s.elements()).find((e) => e.type === "rectangle") as El;
    expect(rect).toBeTruthy();
    expect(labelOf(rect) ?? "").toBe("");
  });

  it("double-click edits; Enter inserts a newline; Escape keeps the text", async () => {
    await s.dblclick({ x: 180, y: 150 });
    await s.page.waitForSelector("[contenteditable]:focus");
    await s.type("first");
    await s.press("Enter");
    await s.type("second");
    // still editing: the shape has not been committed with only the first line
    expect(labelOf((await s.elements()).find((e) => e.type === "rectangle"))?.includes?.("second") ?? false).toBe(false);
    await s.press("Escape");
    const rect = (await s.elements()).find((e) => e.type === "rectangle") as El;
    expect(labelOf(rect)).toBe("first\nsecond");
  });

  it("clicking outside commits an edit", async () => {
    await s.dblclick({ x: 180, y: 150 });
    await s.page.waitForSelector("[contenteditable]:focus");
    await s.press("Control+End");
    await s.type("!");
    await s.click({ x: 600, y: 500 });
    const rect = (await s.elements()).find((e) => e.type === "rectangle") as El;
    expect(labelOf(rect)).toBe("first\nsecond!");
  });

  it("an arrow dragged from one shape to another is attached at both ends", async () => {
    await s.pickTool("r");
    await s.drag({ x: 400, y: 100 }, { x: 560, y: 200 });
    await s.pickTool("a");
    await s.drag({ x: 255, y: 150 }, { x: 405, y: 150 });
    const arrow = (await s.elements()).find((e) => e.type === "arrow") as El;
    expect(arrow).toBeTruthy();
    const rects = (await s.elements()).filter((e) => e.type === "rectangle");
    expect(rects).toHaveLength(2);
    expect(arrow.startConnection?.elementId).toBe(rects[0].id);
    expect(arrow.endConnection?.elementId).toBe(rects[1].id);
  });
});

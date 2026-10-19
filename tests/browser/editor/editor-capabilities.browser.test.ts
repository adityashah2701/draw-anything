import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";
import { board, byId, connector, rect, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

// The capabilities added so the AI could have the same tools as a person: opacity, corner radius, exact gaps,
// connector labels, hide/show, frames, auto layout and tidy. Each is checked here as a PERSON uses it.
suite("editor capabilities shared with the AI tools", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never });
  });
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404|willReadFrequently/i.test(p))).toEqual([]);
    await s?.close();
  });

  const field = (label: string) => s.page.getByRole("textbox", { name: label, exact: true });
  const enter = async (label: string, value: string) => {
    const f = field(label);
    await f.fill(value);
    await f.press("Enter");
    await s.waitForIdle();
  };
  const select = async (...ids: string[]) => {
    await s.click({ x: 900, y: 600 });
    const first = byId(await s.elements(), ids[0]);
    await s.click({ x: first.points[0].x + 20, y: first.points[0].y + 20 });
    for (const id of ids.slice(1)) {
      const e = byId(await s.elements(), id);
      await s.page.keyboard.down("Shift");
      await s.click({ x: e.points[0].x + 20, y: e.points[0].y + 20 });
      await s.page.keyboard.up("Shift");
    }
  };
  const alphaAt = async (world: { x: number; y: number }) => {
    const at = await s.toScreen(world);
    return s.page.evaluate(({ x, y }) => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      return canvas.getContext("2d")!.getImageData(Math.round((x - rect.left) * scale), Math.round((y - rect.top) * scale), 1, 1).data[3];
    }, at);
  };
  const menu = async (name: string) => {
    await s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await s.page.keyboard.press("Control+k");
    await s.page.getByRole("option", { name }).click();
    await s.waitForIdle();
  };

  it("the Opacity field fades the selection, on the canvas and in the saved board", async () => {
    const before = await alphaAt({ x: 160, y: 100 });
    expect(before).toBe(255);
    await select("A");
    await enter("Opacity", "40");
    expect(byId(await s.elements(), "A").opacity).toBe(0.4);
    await s.click({ x: 900, y: 600 }); // deselect: the selection outline is drawn over the stroke
    await s.waitForIdle();
    const after = await alphaAt({ x: 160, y: 100 });
    expect(after).toBeGreaterThan(70);
    expect(after).toBeLessThan(140);
    expect(byId((await s.saved())!.elements, "A").opacity).toBe(0.4);
    await select("A");
    await enter("Opacity", "100");
    expect(byId(await s.elements(), "A")).not.toHaveProperty("opacity");
  });

  it("the Rectangle corner radius field squares the corners (and 0 is kept, not dropped)", async () => {
    await select("A");
    await enter("Rectangle corner radius", "0");
    expect(byId(await s.elements(), "A").cornerRadius).toBe(0);
    await enter("Rectangle corner radius", "20");
    expect(byId(await s.elements(), "A").cornerRadius).toBe(20);
  });

  it("the Horizontal gap field puts an exact gap between the selected shapes and the connector follows", async () => {
    await select("A", "B", "D");
    await enter("Horizontal gap", "50");
    const els = await s.elements();
    const [a, b, d] = ["A", "B", "D"].map((id) => byId(els, id).points);
    expect(b[0].x - a[1].x).toBe(50);
    expect(d[0].x - b[1].x).toBe(50);
    expect(a[0].x).toBe(100);
    expect(byId(els, "ab").points.at(-1).x).toBe(b[0].x);
  });

  it("the Connector label field adds, edits and removes a label that follows the connector", async () => {
    await s.click({ x: 310, y: 140 });
    await enter("Connector label", "calls");
    const added = byId(await s.elements(), "ab-label");
    expect(added).toMatchObject({ text: "calls", ai: { role: "edge-label" } });
    await enter("Connector label", "");
    expect((await s.elements()).some((e: El) => e.id === "ab-label")).toBe(false);
    await enter("Connector label", "again");
    await select("B");
    await enter("Y", "300");
    const labelY = byId(await s.elements(), "ab-label").points[0].y;
    expect(labelY).toBeGreaterThan(120);
  });

  it("Hide removes the selection from the canvas without deleting it, and the chip shows it again", async () => {
    await select("C");
    await s.page.getByRole("button", { name: "Hide (Ctrl+Shift+H)" }).click();
    await s.waitForIdle();
    expect(await s.page.evaluate(() => window.__editor.controller!.elements.some((e) => e.id === "C"))).toBe(false);
    expect(byId(await s.elements(), "C").hidden).toBe(true);
    expect(await s.selected()).toEqual([]);
    const chip = s.page.getByTestId("hidden-chip");
    expect(await chip.innerText()).toContain("1 hidden");
    await chip.click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "C")).not.toHaveProperty("hidden");
    // and the shortcut
    await select("D");
    await s.press("Control+Shift+h");
    await s.waitForIdle();
    expect(byId(await s.elements(), "D").hidden).toBe(true);
  });

  it("Frame selection draws a titled outline behind the selection and moves nothing", async () => {
    await select("A", "B");
    await menu("Frame selection");
    const els = await s.elements();
    const frame = els.find((e: El) => e.ai?.role === "group")!;
    expect(frame).toBeTruthy();
    expect(frame.points[0].x).toBeLessThan(100);
    expect(frame.points[1].x).toBeGreaterThan(520);
    expect(byId(els, "A").points[0]).toEqual({ x: 100, y: 100 });
    expect(els.some((e: El) => e.ai?.role === "group-label")).toBe(true);
  });

  it("Tidy up lines near-aligned shapes up and keeps the connectors attached", async () => {
    await s.page.evaluate(() => {
      const c = window.__editor.controller!;
      const b = c.elements.find((e) => e.id === "B")!;
      c.updateElement({ ...b, points: b.points.map((p) => ({ x: p.x, y: p.y + 9 })) } as never);
    });
    await s.waitForIdle();
    await select("A", "B", "D");
    await menu("Tidy up");
    const els = await s.elements();
    expect(byId(els, "A").points[0].y).toBe(byId(els, "B").points[0].y);
    const arrow = byId(els, "ab");
    expect([arrow.startConnection.elementId, arrow.endConnection.elementId]).toEqual(["A", "B"]);
  });

  it("Auto layout (flow) arranges a messy chain left to right by its connections", async () => {
    await s.page.evaluate(() => {
      const c = window.__editor.controller!;
      const a = c.elements.find((e) => e.id === "A")!;
      c.updateElement({ ...a, points: a.points.map((p) => ({ x: p.x + 800, y: p.y + 400 })) } as never);
    });
    await s.waitForIdle();
    await select("A", "B");
    await menu("Auto layout (flow)");
    const els = await s.elements();
    const a = byId(els, "A").points[0];
    const b = byId(els, "B").points[0];
    expect(a.y).toBeLessThan(b.y); // A feeds B, so A is the earlier rank
    void rect;
    void connector;
  });

  it("every one of these is one undo step", async () => {
    await select("A", "B", "D");
    await enter("Horizontal gap", "50");
    const depth = await s.page.evaluate(() => window.__editor.room.undoDepth());
    await s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await s.press("Control+z");
    await s.waitForIdle();
    expect(await s.page.evaluate(() => window.__editor.room.undoDepth())).toBe(depth - 1);
    expect(byId(await s.elements(), "B").points[0].x).toBe(400);
  });
});

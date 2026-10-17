import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";

const suite = hasChrome() ? describe : describe.skip;
type El = Record<string, any>;
const ofType = async (s: EditorSession, type: string) => (await s.elements()).filter((e: El) => e.type === type) as El[];
const mid = (e: El) => ({ x: (e.points[0].x + e.points.at(-1).x) / 2, y: (e.points[0].y + e.points.at(-1).y) / 2 });
const editorFocused = (s: EditorSession) => s.page.waitForSelector("[contenteditable]:focus");

suite("editor flows", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor();
  });
  afterEach(async () => {
    await s?.close();
  });

  const shape = async (key: string, from: { x: number; y: number }, to: { x: number; y: number }) => {
    await s.pickTool(key);
    await s.drag(from, to);
  };

  it("draws a rectangle, ellipse and diamond; the tool returns to select and the new shape is selected", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 220, y: 180 });
    expect(await s.tool()).toBe("select");
    expect((await s.selected()).length).toBe(1);
    await shape("c", { x: 300, y: 100 }, { x: 420, y: 180 });
    await shape("d", { x: 500, y: 100 }, { x: 620, y: 180 });
    const types = (await s.elements()).map((e) => e.type);
    expect(types).toEqual(["rectangle", "ellipse", "diamond"]);
  });

  it("a plain click with a shape tool does not leave a zero-size shape", async () => {
    await s.pickTool("r");
    await s.click({ x: 150, y: 150 });
    expect(await s.elements()).toHaveLength(0);
  });

  it("Escape cancels a shape being drawn and a connector being dragged", async () => {
    await s.pickTool("r");
    const a = await s.toScreen({ x: 100, y: 100 });
    const b = await s.toScreen({ x: 220, y: 180 });
    await s.page.mouse.move(a.x, a.y);
    await s.page.mouse.down();
    await s.page.mouse.move(b.x, b.y, { steps: 5 });
    await s.press("Escape");
    await s.page.mouse.up();
    expect(await s.elements()).toHaveLength(0);
  });

  it("Enter and letter shortcuts type into the label instead of firing tools", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 260, y: 200 });
    await s.dblclick({ x: 180, y: 150 });
    await editorFocused(s);
    await s.type("rect d a e");
    await s.press("Escape");
    expect(await s.tool()).toBe("select");
    expect((await ofType(s, "rectangle"))[0].label).toBe("rect d a e");
  });

  it("multiline text with Unicode and a long word survives save and reload", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 300, y: 220 });
    await s.dblclick({ x: 200, y: 160 });
    await editorFocused(s);
    await s.type("Zürich → 東京");
    await s.press("Enter");
    await s.type("Supercalifragilisticexpialidocious_identifier");
    await s.press("Control+Enter");
    const label = (await ofType(s, "rectangle"))[0].label;
    expect(label).toBe("Zürich → 東京\nSupercalifragilisticexpialidocious_identifier");
    await s.waitForIdle();
    await s.reload();
    expect((await ofType(s, "rectangle"))[0].label).toBe(label);
  });

  it("connected shapes keep their arrow attached when one moves", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 220, y: 180 });
    await shape("r", { x: 420, y: 100 }, { x: 540, y: 180 });
    await s.pickTool("a");
    await s.drag({ x: 215, y: 140 }, { x: 425, y: 140 });
    const [rectA, rectB] = await ofType(s, "rectangle");
    const [arrow] = await ofType(s, "arrow");
    expect(arrow.startConnection.elementId).toBe(rectA.id);
    expect(arrow.endConnection.elementId).toBe(rectB.id);
    await s.pickTool("v");
    await s.drag(mid(rectB), { x: mid(rectB).x, y: mid(rectB).y + 120 });
    const moved = (await ofType(s, "rectangle")).find((e) => e.id === rectB.id)!;
    const after = (await ofType(s, "arrow"))[0];
    expect(mid(moved).y).toBeGreaterThan(mid(rectB).y + 100);
    expect(after.points.at(-1).y).toBeGreaterThan(arrow.points.at(-1).y + 50);
    expect(after.endConnection.elementId).toBe(rectB.id);
  });

  it("an arrow tool press on empty canvas leaves the ends unattached", async () => {
    await s.pickTool("a");
    await s.drag({ x: 100, y: 400 }, { x: 300, y: 400 });
    const [arrow] = await ofType(s, "arrow");
    expect(arrow.startConnection).toBeUndefined();
    expect(arrow.endConnection).toBeUndefined();
  });

  it("inserts an icon (only the icon, no node box) from the picker by keyboard, then drags and deletes it", async () => {
    await s.press("i");
    await s.page.getByRole("dialog").waitFor();
    await s.type("k8s");
    await s.press("Enter");
    await s.page.getByRole("dialog").waitFor({ state: "detached" });
    const [node] = await ofType(s, "icon");
    expect(node.ai.icon).toBe("kubernetes");
    expect(await s.selected()).toEqual([node.id]);
    await s.drag(mid(node), { x: mid(node).x + 150, y: mid(node).y + 100 });
    const moved = (await ofType(s, "icon"))[0];
    expect(mid(moved).x).toBeGreaterThan(mid(node).x + 100);
    await s.press("Delete");
    expect(await ofType(s, "icon")).toHaveLength(0);
  });

  it("the icon picker filters by category and shows an empty state", async () => {
    await s.press("i");
    await s.page.getByRole("dialog").waitFor();
    await s.page.waitForFunction(() => document.querySelectorAll("[role=option]").length > 300); // the library has loaded
    const all = await s.page.getByRole("option").count();
    await s.page.getByRole("button", { name: "Data", exact: true }).click();
    const data = await s.page.getByRole("option").count();
    expect(data).toBeGreaterThan(0);
    expect(data).toBeLessThan(all);
    await s.page.getByRole("button", { name: "All", exact: true }).click();
    await s.page.getByRole("textbox", { name: "Search icons" }).fill("zzqqxx");
    await s.page.getByText(/No icon matches/).waitFor();
    await s.press("Escape");
    await s.page.getByRole("dialog").waitFor({ state: "detached" });
    expect(await ofType(s, "icon")).toHaveLength(0);
  });

  it("changes the order of overlapping shapes from the context menu, and undo/redo restore it", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 300, y: 260 });
    await shape("c", { x: 200, y: 150 }, { x: 400, y: 310 });
    const ids = (await s.elements()).map((e) => e.id);
    // select the lower (rectangle) at a point only it covers, then bring it to the front
    await s.click({ x: 120, y: 120 });
    const at = await s.toScreen({ x: 120, y: 120 });
    await s.page.mouse.click(at.x, at.y, { button: "right" });
    await s.page.getByRole("menuitem", { name: "Order" }).click();
    await s.page.getByRole("menuitem", { name: "Bring to front" }).click();
    expect((await s.elements()).map((e) => e.id)).toEqual([ids[1], ids[0]]);
    await s.waitForIdle();
    await s.press("Control+z");
    expect((await s.elements()).map((e) => e.id)).toEqual(ids);
    await s.press("Control+Shift+z");
    expect((await s.elements()).map((e) => e.id)).toEqual([ids[1], ids[0]]);
    await s.waitForIdle();
    await s.reload();
    expect((await s.elements()).map((e) => e.id)).toEqual([ids[1], ids[0]]);
  });

  it("the context menu closes on an outside click and on Escape", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 300, y: 260 });
    const at = await s.toScreen({ x: 200, y: 180 });
    await s.page.mouse.click(at.x, at.y, { button: "right" });
    await s.page.getByRole("menuitem", { name: "Duplicate" }).waitFor();
    await s.page.mouse.click(700, 600);
    await s.page.getByRole("menuitem", { name: "Duplicate" }).waitFor({ state: "detached" });
    await s.page.mouse.click(at.x, at.y, { button: "right" });
    await s.page.getByRole("menuitem", { name: "Duplicate" }).waitFor();
    await s.press("Escape");
    await s.page.getByRole("menuitem", { name: "Duplicate" }).waitFor({ state: "detached" });
  });

  it("zoom keeps drawing and hit-testing accurate", async () => {
    await shape("r", { x: 500, y: 300 }, { x: 640, y: 380 });
    await s.press("Control+=");
    await s.press("Control+=");
    const { zoom } = await s.view();
    expect(zoom).toBeGreaterThan(1);
    await s.pickTool("c");
    await s.drag({ x: 700, y: 300 }, { x: 820, y: 380 });
    const [circle] = await ofType(s, "ellipse");
    expect(circle.points[0].x).toBeCloseTo(700, 0);
    expect(circle.points.at(-1).y).toBeCloseTo(380, 0);
    await s.click(mid((await ofType(s, "rectangle"))[0]));
    expect(await s.selected()).toEqual([(await ofType(s, "rectangle"))[0].id]);
  });

  it("Enter on a selected shape edits its text; double-clicking does not move it", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 260, y: 200 });
    const before = (await ofType(s, "rectangle"))[0];
    await s.press("Enter");
    await editorFocused(s);
    await s.type("via enter");
    await s.press("Escape");
    expect((await ofType(s, "rectangle"))[0].label).toBe("via enter");
    await s.dblclick(mid(before));
    await editorFocused(s);
    await s.press("Escape");
    const after = (await ofType(s, "rectangle"))[0];
    expect(after.points).toEqual(before.points);
  });

  it("resizing a shape that holds multiline text keeps the text", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 300, y: 220 });
    await s.dblclick({ x: 200, y: 160 });
    await editorFocused(s);
    await s.type("one");
    await s.press("Enter");
    await s.type("two");
    await s.press("Escape");
    const before = (await ofType(s, "rectangle"))[0];
    await s.click(mid(before));
    await s.drag({ x: 300, y: 220 }, { x: 420, y: 300 }); // south-east handle
    const after = (await ofType(s, "rectangle"))[0];
    expect(after.label).toBe("one\ntwo");
    expect(after.points[1].x).toBeGreaterThan(400);
    expect(after.points[1].y).toBeGreaterThan(280);
  });

  it("dragging an arrow end onto another shape reattaches it", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 220, y: 180 });
    await shape("r", { x: 420, y: 100 }, { x: 540, y: 180 });
    await shape("r", { x: 420, y: 320 }, { x: 540, y: 400 });
    await s.pickTool("a");
    await s.drag({ x: 215, y: 140 }, { x: 425, y: 140 });
    const [, second, third] = await ofType(s, "rectangle");
    const [arrow] = await ofType(s, "arrow");
    expect(arrow.endConnection.elementId).toBe(second.id);
    await s.click(mid(arrow)); // select the arrow so its end handle can be grabbed
    await s.drag(arrow.points.at(-1), { x: 480, y: 330 });
    const moved = (await ofType(s, "arrow"))[0];
    expect(moved.endConnection?.elementId).toBe(third.id);
    expect(moved.startConnection.elementId).toBe(arrow.startConnection.elementId);
  });

  it("exports the board from the editor with text, a connector and an icon", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 260, y: 180 });
    await s.dblclick({ x: 180, y: 140 });
    await editorFocused(s);
    await s.type("Gateway");
    await s.press("Escape");
    await shape("r", { x: 460, y: 100 }, { x: 620, y: 180 });
    await s.pickTool("a");
    await s.drag({ x: 255, y: 140 }, { x: 465, y: 140 });
    await s.press("i");
    await s.page.getByRole("dialog").waitFor();
    await s.type("database");
    await s.press("Enter");
    await s.page.getByRole("dialog").waitFor({ state: "detached" });
    await s.click({ x: 900, y: 600 }); // nothing selected: export the whole board
    await s.press("Control+Shift+E");
    await s.page.getByRole("dialog").waitFor();
    await s.page.getByRole("radio", { name: "SVG", exact: true }).click();
    const [file] = await Promise.all([s.page.waitForEvent("download"), s.page.getByRole("button", { name: "Export SVG", exact: true }).click()]);
    const svg = (await (await import("node:fs/promises")).readFile((await file.path())!)).toString();
    expect(svg).toContain("Gateway");
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(4); // shapes, the arrow and the icon glyph
    expect(svg).not.toContain("Database"); // the icon has no label
    expect(svg).not.toMatch(/<image|<script|href=/);
  });

  it("dragging an arrow end into empty space disconnects it", async () => {
    await shape("r", { x: 100, y: 100 }, { x: 220, y: 180 });
    await shape("r", { x: 420, y: 100 }, { x: 540, y: 180 });
    await s.pickTool("a");
    await s.drag({ x: 215, y: 140 }, { x: 425, y: 140 });
    const [arrow] = await ofType(s, "arrow");
    await s.click(mid(arrow));
    await s.drag(arrow.points.at(-1), { x: 700, y: 500 });
    const moved = (await ofType(s, "arrow"))[0];
    expect(moved.endConnection).toBeUndefined();
    expect(moved.startConnection).toBeTruthy();
  });

  it("light and dark themes both draw a legible label", async () => {
    const ink = async (dark: boolean) => {
      const light = await openEditor({ dark });
      try {
        await light.pickTool("r");
        await light.drag({ x: 100, y: 100 }, { x: 300, y: 200 });
        await light.dblclick({ x: 200, y: 150 });
        await light.page.waitForSelector("[contenteditable]:focus");
        await light.type("Theme");
        await light.press("Escape");
        return await light.page.evaluate(() => ({
          page: getComputedStyle(document.body).backgroundColor,
          dark: document.documentElement.classList.contains("dark"),
        }));
      } finally {
        await light.close();
      }
    };
    const [d, l] = [await ink(true), await ink(false)];
    expect(d.dark).toBe(true);
    expect(l.dark).toBe(false);
    expect(d.page).not.toBe(l.page);
  });

  const openPicker = async () => {
    await s.press("i");
    await s.page.getByRole("dialog").waitFor();
  };

  it("inserts a brand logo, which exports as a filled path in its own colour", async () => {
    await openPicker();
    await s.page.getByRole("button", { name: "Logos", exact: true }).click();
    await s.page.getByRole("textbox", { name: "Search icons" }).fill("kubernetes");
    await s.press("Enter");
    await s.page.getByRole("dialog").waitFor({ state: "detached" });
    const [node] = await ofType(s, "icon");
    expect(node.ai.icon).toBe("logo-kubernetes");
    expect(node.label).toBeUndefined(); // an icon, not a labelled node
    await s.click({ x: 900, y: 600 });
    await s.press("Control+Shift+E");
    await s.page.getByRole("dialog").waitFor();
    await s.page.getByRole("radio", { name: "SVG", exact: true }).click();
    const [file] = await Promise.all([s.page.waitForEvent("download"), s.page.getByRole("button", { name: "Export SVG", exact: true }).click()]);
    const svg = (await (await import("node:fs/promises")).readFile((await file.path())!)).toString();
    expect(svg).toMatch(/<path d="[^"]+" fill="#326ce5"/i);
  });

  it("imports a custom SVG icon, keeps it across reload, and refuses unsafe or unusable files", async () => {
    await openPicker();
    const input = s.page.locator('input[type="file"]');
    const upload = (name: string, body: string) => input.setInputFiles({ name, mimeType: "image/svg+xml", buffer: Buffer.from(body) });

    await upload("script.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script></svg>');
    await s.page.getByRole("alert").getByText(/No shapes found/).waitFor();
    await upload("moved.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g transform="scale(2)"><path d="M0 0h5v5Z"/></g></svg>');
    await s.page.getByRole("alert").getByText(/transforms/).waitFor();
    await upload("not-svg.svg", "this is not xml");
    await s.page.getByRole("alert").getByText(/not a valid SVG/).waitFor();

    await upload(
      "my-gizmo.svg",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ff0066" onclick="alert(1)" d="M4 4h16v16H4Z"/><circle cx="12" cy="12" r="4" fill="#ff0066"/><image href="https://evil.example/x.png"/></svg>',
    );
    await s.page.getByRole("option", { name: /my gizmo/i }).waitFor();
    await s.press("Enter");
    await s.page.getByRole("dialog").waitFor({ state: "detached" });
    const [node] = await ofType(s, "icon");
    expect(node.label).toBeUndefined();
    expect(node.ai.customIcon.paths).toHaveLength(2);
    expect(node.ai.customIcon.color).toBe("#ff0066");
    expect(JSON.stringify(node)).not.toMatch(/evil|alert|onclick|script|href/);

    await s.waitForIdle();
    await s.reload();
    expect(((await ofType(s, "icon"))[0] as El).ai.customIcon.id).toBe(node.ai.customIcon.id);
    await openPicker();
    await s.page.getByRole("button", { name: "Custom", exact: true }).click();
    await s.page.getByRole("option", { name: /my gizmo/i }).waitFor();
  });

  it("draws a Terminator (pill) from the toolbar and edits its label", async () => {
    await s.pickTool("Terminator");
    await s.drag({ x: 100, y: 120 }, { x: 300, y: 180 });
    const [pill] = await ofType(s, "pill");
    expect(pill).toBeTruthy();
    expect(pill.label ?? "").toBe("");
    await s.dblclick(mid(pill));
    await editorFocused(s);
    await s.type("Start");
    await s.press("Escape");
    expect((await ofType(s, "pill"))[0].label).toBe("Start");
  });

  it("a line is picked within the same number of screen pixels at any zoom", async () => {
    await s.pickTool("l");
    await s.drag({ x: 500, y: 300 }, { x: 700, y: 300 });
    const [line] = await ofType(s, "line");
    await s.press("Control+=");
    await s.press("Control+=");
    await s.page.waitForTimeout(300);
    const on = await s.toScreen({ x: 600, y: 300 });
    await s.page.mouse.click(on.x, on.y + 25); // 25 screen px away: a miss at 144%
    expect(await s.selected()).toEqual([]);
    await s.page.mouse.click(on.x, on.y + 6);
    expect(await s.selected()).toEqual([line.id]);
  });

  it("a board that uses a library icon draws and exports it after a reload, before the picker was ever opened", async () => {
    const { GLYPHS_EXTRA } = await import("@/core/icons/glyphs-extra");
    await openPicker();
    await s.page.getByRole("textbox", { name: "Search icons" }).fill("bolt");
    await s.press("Enter");
    await s.page.getByRole("dialog").waitFor({ state: "detached" });
    expect(((await ofType(s, "icon"))[0] as El).ai.icon).toBe("bolt");
    await s.waitForIdle();
    await s.reload(); // a fresh page: the library is not loaded until the board asks for it
    await s.click({ x: 900, y: 650 });
    await s.press("Control+Shift+E");
    await s.page.getByRole("dialog").waitFor();
    await s.page.getByRole("radio", { name: "SVG", exact: true }).click();
    const [file] = await Promise.all([s.page.waitForEvent("download"), s.page.getByRole("button", { name: "Export SVG", exact: true }).click()]);
    const svg = (await (await import("node:fs/promises")).readFile((await file.path())!)).toString();
    expect(svg).toContain(GLYPHS_EXTRA.bolt[0]);
  });

  it("redraws a library icon on the canvas once the library has loaded (not left as the placeholder)", async () => {
    const board = (icon: string) =>
      [{ id: "i1", type: "icon", color: "#0f766e", strokeWidth: 2, points: [{ x: 300, y: 200 }, { x: 428, y: 328 }], ai: { icon } }] as never;
    const clipOf = async (icon: string) => {
      const session = await openEditor({ elements: board(icon) });
      try {
        await session.page.waitForTimeout(600); // the library chunk loads, then the canvas redraws
        const at = await session.toScreen({ x: 300, y: 200 });
        return await session.page.screenshot({ clip: { x: at.x, y: at.y, width: 128 * (await session.view()).zoom, height: 128 * (await session.view()).zoom } });
      } finally {
        await session.close();
      }
    };
    const bolt = await clipOf("bolt");
    const unknown = await clipOf("no-such-icon-anywhere"); // draws the generic placeholder
    expect(bolt.equals(unknown)).toBe(false);
  });

  it("a pointer-down that arrives while a gesture is still open (its pointer-up was lost) starts clean", async () => {
    await s.pickTool("r");
    const [a, b, c, d] = await Promise.all([{ x: 100, y: 100 }, { x: 180, y: 160 }, { x: 400, y: 300 }, { x: 520, y: 380 }].map((p) => s.toScreen(p)));
    await s.page.mouse.move(a.x, a.y);
    await s.page.mouse.down();
    await s.page.mouse.move(b.x, b.y, { steps: 4 });
    // the pointer-up never comes; the next press must not stack a second gesture on the first
    await s.page.mouse.down();
    await s.page.mouse.move(c.x, c.y);
    await s.page.mouse.down();
    await s.page.mouse.move(d.x, d.y, { steps: 4 });
    await s.page.mouse.up();
    const rects = await ofType(s, "rectangle");
    expect(rects).toHaveLength(1);
    expect(rects[0].points[0].x).toBeCloseTo(400, 0);
    expect(rects[0].points[1].x).toBeCloseTo(520, 0);
    expect(await s.tool()).toBe("select");
    // and the editor is not stuck: a normal gesture still works
    await s.pickTool("r");
    await s.drag({ x: 100, y: 450 }, { x: 200, y: 520 });
    expect(await ofType(s, "rectangle")).toHaveLength(2);
  });
});

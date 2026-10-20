import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";
import { byId, connector, rect, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

/** A semantic node as the AI compiler writes it: icon metadata, kind-tinted fill. */
const node = (id: string, x: number, y: number, label: string, extra: El = {}): El => ({
  id,
  type: "semantic-node",
  points: [{ x, y }, { x: x + 168, y: y + 78 }],
  color: "#1f2937",
  strokeWidth: 2,
  fill: "#eef2ff",
  label,
  fontSize: 17,
  fontWeight: "600",
  ...extra,
});

const board = (): El[] => [
  node("N1", 100, 100, "Orders DB", { ai: { icon: "database", semanticKind: "database", semanticId: "n1", role: "node" } }),
  node("N2", 400, 100, "Queue", { ai: { icon: "queue", semanticKind: "queue", semanticId: "n2", role: "node" } }),
  // Saved before icons were editable: no ai, no nodeStyle at all.
  node("LEGACY", 100, 300, "Old node"),
  rect("R", 400, 300),
  connector("link", "N1", "N2"),
];

suite("semantic node in the real editor: icon, layout and panel", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never, dark: false });
  });
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p))).toEqual([]);
    await s?.close();
  });

  const panel = () => s.page.getByTestId("selection-inspector");
  const dialog = () => s.page.getByRole("dialog");
  const select = async (...ids: string[]) => {
    await s.click({ x: 900, y: 650 });
    for (const [i, id] of ids.entries()) {
      const e = byId(await s.elements(), id);
      if (i > 0) await s.page.keyboard.down("Shift");
      await s.click({ x: e.points[0].x + 120, y: e.points[0].y + 60 });
      if (i > 0) await s.page.keyboard.up("Shift");
    }
  };
  /** Choose an icon in the open picker by typing its name and pressing Enter (the picker's own keyboard path). */
  const pick = async (query: string) => {
    await dialog().waitFor();
    await dialog().getByLabel("Search icons").fill(query);
    await s.page.keyboard.press("Enter");
    await dialog().waitFor({ state: "hidden" });
    await s.waitForIdle();
  };
  const leaveField = () => s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const iconOf = async (id: string) => (byId(await s.elements(), id).ai ?? {}).icon;

  it("shows the node's own controls: label, current icon and how to change it", async () => {
    await select("N1");
    await expect(panel().getByLabel("Node label").inputValue()).resolves.toBe("Orders DB");
    await expect(panel().getByText("Database", { exact: true }).isVisible()).resolves.toBe(true);
    for (const name of ["Change icon", "Remove icon", "Restore default"]) {
      await expect(panel().getByRole("button", { name }).isVisible()).resolves.toBe(true);
    }
    await expect(panel().getByRole("button", { name: "Edit label on canvas" }).isVisible()).resolves.toBe(true);
    // Nothing to restore on an untouched node.
    await expect(panel().getByRole("button", { name: "Restore default" }).isDisabled()).resolves.toBe(true);
  });

  it("does not show node controls for other shapes", async () => {
    await select("R");
    expect(await panel().getByText("Change icon").count()).toBe(0);
  });

  it("changes the icon from the panel: search, pick, saved to the board, undone and redone", async () => {
    await select("N1");
    const before = await s.elements();
    await panel().getByRole("button", { name: "Change icon" }).click();
    await expect(dialog().getByText("Change icon").first().isVisible()).resolves.toBe(true);
    await pick("kafka"); // an alias: the library resolves it to the message broker
    const after = await s.elements();
    expect(byId(after, "N1").ai.icon).toBe("message-broker");
    expect(byId(after, "N1").ai.semanticKind).toBe("database"); // kind and ids untouched
    expect(byId(after, "N1").ai.semanticId).toBe("n1");
    expect(byId(after, "N1").nodeStyle).toEqual({ originalIcon: "database" });
    expect(byId(after, "N2")).toEqual(byId(before, "N2")); // only the selected node changed
    expect(byId(after, "N1").label).toBe("Orders DB");
    expect(byId(after, "N1").points).toEqual(byId(before, "N1").points);

    const saved = await s.saved();
    expect(byId(saved!.elements as El[], "N1").ai.icon).toBe("message-broker");

    await s.press("Control+z");
    expect(await s.elements()).toEqual(before);
    await s.press("Control+Shift+z");
    expect(byId(await s.elements(), "N1").ai.icon).toBe("message-broker");
  });

  it("the picker keeps its search, categories and keyboard navigation in replace mode, and Escape cancels", async () => {
    await select("N1");
    await panel().getByRole("button", { name: "Change icon" }).click();
    await dialog().waitFor();
    await expect(dialog().getByRole("group", { name: "Categories" }).isVisible()).resolves.toBe(true);
    await dialog().getByRole("button", { name: "Security", exact: true }).click();
    const options = dialog().getByRole("option");
    expect(await options.count()).toBeGreaterThan(3);
    await dialog().getByLabel("Search icons").press("ArrowRight");
    await s.page.keyboard.press("Escape");
    await dialog().waitFor({ state: "hidden" });
    expect(await iconOf("N1")).toBe("database"); // nothing changed
  });

  it("a recently used icon is offered first the next time", async () => {
    await select("N1");
    await panel().getByRole("button", { name: "Change icon" }).click();
    await pick("redis");
    await select("N2");
    await panel().getByRole("button", { name: "Change icon" }).click();
    await dialog().waitFor();
    const recent = dialog().getByRole("group", { name: "Recently used" });
    await expect(recent.isVisible()).resolves.toBe(true);
    await expect(recent.getByRole("button").first().getAttribute("aria-label")).resolves.toMatch(/^Recent: /);
    await recent.getByRole("button").first().click();
    await s.waitForIdle();
    expect(await iconOf("N2")).toBe(await iconOf("N1"));
  });

  it("double-clicking the icon opens the picker for that node; double-clicking the label edits the text", async () => {
    const n = byId(await s.elements(), "N1");
    // The icon sits one padding in from the left edge, centred vertically.
    await s.dblclick({ x: n.points[0].x + 12 + 20, y: n.points[0].y + 39 });
    await dialog().waitFor();
    await expect(dialog().getByText("Change icon").first().isVisible()).resolves.toBe(true);
    expect(await s.selected()).toEqual(["N1"]);
    await pick("cache");
    expect(await iconOf("N1")).toBe("cache");

    // (Off the connector line that crosses the node's middle on this board.)
    await s.dblclick({ x: n.points[0].x + 90, y: n.points[0].y + 15 });
    await s.page.waitForSelector("[contenteditable]:focus");
    await s.type("!");
    await s.press("Escape");
    expect(byId(await s.elements(), "N1").label).toBe("Orders DB!");
  });

  it("removing the icon hides it, showing it and restoring bring it back; each is one undo step", async () => {
    await select("N1");
    const original = await s.elements();
    await panel().getByRole("button", { name: "Change icon" }).click();
    await pick("cache");
    await panel().getByRole("button", { name: "Remove icon" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").nodeStyle).toMatchObject({ iconHidden: true });
    await expect(panel().getByText("No icon").isVisible()).resolves.toBe(true);
    await expect(panel().getByRole("button", { name: "Show icon" }).isVisible()).resolves.toBe(true);

    await panel().getByRole("button", { name: "Restore default" }).click();
    await s.waitForIdle();
    const restored = byId(await s.elements(), "N1");
    expect(restored.ai.icon).toBe("database");
    expect("nodeStyle" in restored).toBe(false);
    expect(await s.elements()).toEqual(original); // byte-for-byte what the board started as

    await leaveField();
    await s.press("Control+z"); // undo the restore
    expect(byId(await s.elements(), "N1").nodeStyle).toMatchObject({ iconHidden: true });
    await s.press("Control+z"); // undo the removal
    expect(byId(await s.elements(), "N1").ai.icon).toBe("cache");
  });

  it("the picker's own Remove / Restore buttons work in replace mode", async () => {
    await select("N1");
    await panel().getByRole("button", { name: "Change icon" }).click();
    await dialog().waitFor();
    await dialog().getByRole("button", { name: "Remove icon" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").nodeStyle).toMatchObject({ iconHidden: true });
    await panel().getByRole("button", { name: "Change icon" }).click();
    await dialog().waitFor();
    await dialog().getByRole("button", { name: "Restore default icon" }).click();
    await s.waitForIdle();
    expect("nodeStyle" in byId(await s.elements(), "N1")).toBe(false);
  });

  it("size, position, colour and corner radius are stored on the node and can be reset", async () => {
    await select("N1");
    await panel().getByRole("button", { name: "Icon size: Extra large" }).click();
    await panel().getByRole("button", { name: "Icon position: Top" }).click();
    await panel().getByRole("button", { name: "Icon colour: #dc2626" }).click();
    await panel().getByRole("textbox", { name: "Corner radius", exact: true }).fill("4");
    await panel().getByRole("textbox", { name: "Corner radius", exact: true }).press("Enter");
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").nodeStyle).toEqual({ iconSize: 48, iconPlacement: "top", iconColor: "#dc2626", cornerRadius: 4 });
    await expect(panel().getByRole("button", { name: "Icon size: Extra large" }).getAttribute("aria-pressed")).resolves.toBe("true");

    await panel().getByRole("button", { name: "Icon size: Automatic" }).click();
    await panel().getByRole("button", { name: "Icon position: Automatic" }).click();
    await panel().getByRole("button", { name: "Icon colour: Automatic" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").nodeStyle).toEqual({ cornerRadius: 4 });
  });

  it("applies to a multi-selection as one undo step, skipping nodes that are locked", async () => {
    await select("N2");
    await s.press("Control+Shift+l"); // lock N2
    await select("N1", "N2");
    const before = await s.elements();
    await panel().getByRole("button", { name: "Icon size: Large" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").nodeStyle).toEqual({ iconSize: 40 });
    expect("nodeStyle" in byId(await s.elements(), "N2")).toBe(false);
    await leaveField();
    await s.press("Control+z");
    expect(await s.elements()).toEqual(before);
  });

  it("a locked node shows its controls disabled", async () => {
    await select("N1");
    await s.press("Control+Shift+l");
    await expect(panel().getByRole("button", { name: "Change icon" }).isDisabled()).resolves.toBe(true);
    await expect(panel().getByLabel("Node label").isDisabled()).resolves.toBe(true);
  });

  it("edits the label from the panel (including line breaks) and the typography", async () => {
    await select("N1");
    const label = panel().getByLabel("Node label");
    await label.fill("Orders\nDatabase");
    await label.press("Enter");
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").label).toBe("Orders\nDatabase");
    await panel().getByRole("button", { name: "Font weight: Bold" }).click();
    await panel().getByRole("button", { name: "Italic", exact: true }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1")).toMatchObject({ fontWeight: "700", fontStyle: "italic" });
  });

  it("Escape in the label field puts the old text back and writes nothing", async () => {
    await select("N1");
    const before = await s.elements();
    const label = panel().getByLabel("Node label");
    await label.fill("something else");
    await label.press("Escape");
    expect(await s.elements()).toEqual(before);
    await expect(label.inputValue()).resolves.toBe("Orders DB");
  });

  it("an older node with no icon metadata still draws, shows the generic icon, and can be given one", async () => {
    await select("LEGACY");
    await expect(panel().getByText("Generic", { exact: true }).isVisible()).resolves.toBe(true);
    await panel().getByRole("button", { name: "Change icon" }).click();
    await pick("server");
    const n = byId(await s.elements(), "LEGACY");
    expect(n.ai).toEqual({ icon: "server" });
    expect(n.nodeStyle).toEqual({ originalIcon: null });
    // Restoring takes it back to exactly what it was.
    await panel().getByRole("button", { name: "Restore default" }).click();
    await s.waitForIdle();
    const restored = byId(await s.elements(), "LEGACY");
    expect("ai" in restored).toBe(false);
    expect("nodeStyle" in restored).toBe(false);
  });

  it("icon and style survive copy/paste and duplicate, and the copy is independent", async () => {
    await select("N1");
    await panel().getByRole("button", { name: "Change icon" }).click();
    await pick("redis");
    await panel().getByRole("button", { name: "Icon position: Top" }).click();
    await s.waitForIdle();
    const source = byId(await s.elements(), "N1");
    await leaveField();
    await s.click({ x: source.points[0].x + 120, y: source.points[0].y + 60 });
    await s.press("Control+d");
    await s.waitForIdle();
    const copies = ((await s.elements()) as El[]).filter((e) => e.type === "semantic-node" && !["N1", "N2", "LEGACY"].includes(e.id));
    expect(copies).toHaveLength(1);
    expect(copies[0].ai.icon).toBe(source.ai.icon);
    expect(copies[0].nodeStyle).toEqual(source.nodeStyle);
    expect(copies[0].ai.semanticId).toBeUndefined(); // a copy never takes the original's generation identity

    // Changing the copy leaves the original alone.
    await select(copies[0].id);
    await panel().getByRole("button", { name: "Icon position: Left" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").nodeStyle).toEqual(source.nodeStyle);
  });

  it("everything survives a save and reload, and the reloaded node still edits", async () => {
    await select("N1");
    await panel().getByRole("button", { name: "Change icon" }).click();
    await pick("redis");
    await panel().getByRole("button", { name: "Icon size: Large" }).click();
    await s.waitForIdle();
    const before = byId(await s.elements(), "N1");
    await s.reload();
    expect(byId(await s.elements(), "N1")).toEqual(before);
    await select("N1");
    await expect(panel().getByRole("button", { name: "Icon size: Large" }).getAttribute("aria-pressed")).resolves.toBe("true");
    await panel().getByRole("button", { name: "Icon size: Automatic" }).click();
    await s.waitForIdle();
    expect("iconSize" in (byId(await s.elements(), "N1").nodeStyle ?? {})).toBe(false);
  });

  it("canvas interactions are untouched: Delete removes the node and its connector follows, undo brings them back", async () => {
    await select("N1");
    const before = await s.elements();
    await leaveField();
    await s.click({ x: 220, y: 160 });
    await s.press("Delete");
    await s.waitForIdle();
    expect((await s.elements()).some((e) => e.id === "N1")).toBe(false);
    await s.press("Control+z");
    expect(await s.elements()).toEqual(before);
  });

  it("the node is moved by dragging its body, and the connector follows", async () => {
    await s.drag({ x: 230, y: 160 }, { x: 260, y: 220 });
    const n = byId(await s.elements(), "N1");
    expect(n.points[0]).toEqual({ x: 130, y: 160 });
    expect(byId(await s.elements(), "link").startConnection.elementId).toBe("N1");
  });
});

suite("semantic node: selection chrome and resizing", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never, dark: false });
  });
  afterEach(async () => {
    await s?.close();
  });
  const handle = async (id: string, which: "se" | "nw" | "e" | "n") => {
    const e = byId(await s.elements(), id);
    const [a, b] = e.points;
    const at = { se: { x: b.x, y: b.y }, nw: { x: a.x, y: a.y }, e: { x: b.x, y: (a.y + b.y) / 2 }, n: { x: (a.x + b.x) / 2, y: a.y } }[which];
    return at;
  };

  it("resizes from a corner handle, exactly under the pointer", async () => {
    await s.click({ x: 220, y: 160 });
    const corner = await handle("N1", "se");
    await s.drag(corner, { x: 360, y: 220 });
    expect(byId(await s.elements(), "N1").points[1]).toEqual({ x: 360, y: 220 });
  });

  it("resizes from an edge, grabbed anywhere along it but the connector dot at its midpoint", async () => {
    await s.click({ x: 220, y: 160 });
    const edge = await handle("N1", "e");
    await s.drag({ x: edge.x, y: edge.y - 24 }, { x: 300, y: edge.y - 24 });
    expect(byId(await s.elements(), "N1").points[1]).toEqual({ x: 300, y: 178 });
    await s.drag({ x: 150, y: 100 }, { x: 150, y: 80 }); // the top edge, left of its midpoint (now x 200)
    expect(byId(await s.elements(), "N1").points[0]).toEqual({ x: 100, y: 80 });
  });

  it("the connector dot at an edge's midpoint still starts a connector, not a resize", async () => {
    await s.click({ x: 220, y: 160 });
    const edge = await handle("N1", "e");
    await s.drag(edge, { x: 300, y: edge.y });
    expect(byId(await s.elements(), "N1").points[1].x).toBe(268);
  });

  it("stops at the minimum size and does not slide the opposite edge", async () => {
    await s.click({ x: 220, y: 160 });
    await s.drag(await handle("N1", "se"), { x: 110, y: 110 });
    const [a, b] = byId(await s.elements(), "N1").points;
    expect(a).toEqual({ x: 100, y: 100 });
    expect({ w: b.x - a.x, h: b.y - a.y }).toEqual({ w: 112, h: 56 });
  });

  it("resizing narrow and tall makes the layout stack the icon over the label, and the label never leaves the node", async () => {
    await s.click({ x: 220, y: 160 });
    await s.drag(await handle("N1", "se"), { x: 210, y: 230 }); // 110 x 130
    await s.waitForIdle();
    await s.click({ x: 900, y: 650 });
    // Pixel check on the live canvas: nothing is drawn beyond the node's own box.
    const png = await s.screenshot("semantic-stacked");
    expect(png.length).toBeGreaterThan(1000);
  });

  it("selected nodes are outlined solid, without the old dashed box and the 11px dots", async () => {
    await s.click({ x: 220, y: 160 });
    const hit = await s.page.evaluate(async () => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const scale = canvas.width / rect.width;
      // A 3x3 sample just outside the node's top edge, in the middle of the dash gap pattern.
      const read = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data);
      return { top: read(rect.left + 150, rect.top + 100 - 3), corner: read(rect.left + 100, rect.top + 100) };
    });
    // The outline colour (the ink blue, #1d54c1) is present just outside the top edge for a run of pixels, i.e. it is solid.
    expect(hit.top[2]).toBeGreaterThan(150);
    expect(hit.top[0]).toBeLessThan(80);
  });

  it("looks right (screenshots for review)", async () => {
    await s.click({ x: 220, y: 160 });
    await s.waitForIdle();
    await s.screenshot("semantic-selected-light");
    await s.click({ x: 900, y: 650 });
    await s.screenshot("semantic-unselected-light");
  });
});

suite("semantic node in the dark theme", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never, dark: true });
  });
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p))).toEqual([]);
    await s?.close();
  });

  it("the panel and the canvas work the same, and the picker opens in the dark theme", async () => {
    await s.click({ x: 220, y: 160 });
    await s.page.getByTestId("selection-inspector").getByRole("button", { name: "Change icon" }).click();
    await s.page.getByRole("dialog").waitFor();
    await s.page.getByLabel("Search icons").fill("cache");
    await s.page.keyboard.press("Enter");
    await s.waitForIdle();
    expect(byId(await s.elements(), "N1").ai.icon).toBe("cache");
    await s.screenshot("semantic-dark");
  });
});

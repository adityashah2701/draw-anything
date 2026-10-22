import { afterEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession, type Point } from "./open-editor";
import { byId, connector, rect, sorted, type El } from "./group-fixtures";

const frame = (id: string, x: number, y: number, w: number, h: number, extra: El = {}): El => ({
  id,
  type: "frame",
  points: [
    { x, y },
    { x: x + w, y: y + h },
  ],
  color: "#64748b",
  strokeWidth: 1,
  ...extra,
});

/** Billing (inside header) owns A, B and the connector; Tab (above header) owns D; C is loose. */
const scene = (): El[] => [
  frame("F", 80, 60, 520, 360, { title: "Billing" }),
  rect("A", 120, 130, 120, 80, { frameId: "F", fill: "#fde68a" }),
  rect("B", 340, 130, 120, 80, { frameId: "F" }),
  connector("ab", "A", "B", { frameId: "F", points: [{ x: 240, y: 170 }, { x: 340, y: 170 }] }),
  rect("C", 700, 130),
  frame("G", 80, 520, 300, 200, { title: "Tab", titlePlacement: "above" }),
  rect("D", 120, 570, 100, 60, { frameId: "G" }),
];

const suite = hasChrome() ? describe : describe.skip;
suite("editor frames: properties", () => {
  let s: EditorSession | undefined;
  afterEach(async () => {
    if (s) {
      expect(s.problems.filter((p) => !/favicon|404|willReadFrequently/i.test(p))).toEqual([]);
      await s.close();
    }
    s = undefined;
  });

  const bar = (session: EditorSession) => session.page.getByRole("toolbar", { name: "Style properties" });
  const chip = (session: EditorSession, label: RegExp | string) => bar(session).getByRole("button", { name: label });
  const popover = (session: EditorSession, name: string) => session.page.getByRole("dialog", { name, exact: true });
  const open = async () => {
    const session = await openEditor({ elements: scene() as never, dark: false, viewport: { width: 1280, height: 800 } });
    await session.click({ x: 300, y: 76 }); // Billing's header
    await session.waitForIdle();
    return session;
  };

  it("a selected frame offers its own Frame section ahead of stroke, fill, corners and opacity", async () => {
    s = await open();
    const labels = await bar(s).locator("[data-chip-trigger]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.split(":")[0]));
    expect(labels).toEqual(["Frame", "Stroke", "Fill", "Corners", "Opacity"]);
    expect(await bar(s).getByTestId("properties-title").innerText()).toContain("Frame");
    await chip(s, /^Frame/).click();
    await s.screenshot("frame-properties-popover");
  });

  it("renames the frame from the bar as one undo step", async () => {
    s = await open();
    await chip(s, /^Frame/).click();
    const field = popover(s, "Frame").getByRole("textbox", { name: "Frame title" });
    await field.fill("Payments");
    await field.press("Enter");
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").title).toBe("Payments");
    await s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await s.press("Control+z");
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").title).toBe("Billing");
  });

  it("moves the title to a tab, and hides it", async () => {
    s = await open();
    await chip(s, /^Frame/).click();
    await popover(s, "Frame").getByRole("button", { name: "Frame header: Title on a tab above the frame" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "F")).toMatchObject({ titlePlacement: "above" }); // a visible header is the default, so nothing else is stored
    expect(byId(await s.elements(), "F").headerVisible).not.toBe(false);
    await popover(s, "Frame").getByRole("button", { name: "Frame header: No title" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").headerVisible).toBe(false);
  });

  it("auto-fit wraps the contents, and Fit to content does it once for a manual frame", async () => {
    s = await open();
    await chip(s, /^Frame/).click();
    await popover(s, "Frame").getByRole("button", { name: "Fit to content" }).click();
    await s.waitForIdle();
    const fitted = byId(await s.elements(), "F").points;
    expect(Math.round(fitted[1].x)).toBe(460 + 24); // B's right edge plus the default padding
    expect(Math.round(fitted[0].x)).toBe(120 - 24);
    expect(byId(await s.elements(), "F").autoFit).toBeUndefined();
    await popover(s, "Frame").getByRole("button", { name: "Frame size mode: Always wrap its contents" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").autoFit).toBe(true);
    const padding = popover(s, "Frame").getByRole("textbox", { name: "Frame padding in pixels" });
    await padding.fill("40");
    await padding.press("Enter");
    await s.waitForIdle();
    const grown = byId(await s.elements(), "F").points;
    expect(Math.round(grown[1].x)).toBe(460 + 40);
  });

  it("styles the frame like any shape: corner radius and fill", async () => {
    s = await open();
    await chip(s, /^Corners/).click();
    await popover(s, "Corners").getByRole("button", { name: "Corner radius: Round corners" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").cornerRadius).toBe(16);
    await s.page.keyboard.press("Escape");
    await chip(s, /^Fill/).click();
    await popover(s, "Fill").getByRole("button", { name: "Fill #dcfce7" }).click();
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").fill).toBe("#dcfce7");
    expect(byId(await s.elements(), "A").fill).toBe("#fde68a"); // contents untouched
  });

  it("the inspector's X and Y move a frame with its contents; W and H resize only the frame", async () => {
    s = await open();
    const field = (label: string) => s!.page.getByRole("textbox", { name: label, exact: true });
    await field("X").fill("180");
    await field("X").press("Enter");
    await s.waitForIdle();
    let els = await s.elements();
    expect(byId(els, "F").points[0].x).toBe(180);
    expect(byId(els, "A").points[0].x).toBe(220); // 100 to the right, like the frame
    expect(byId(els, "ab").points[0].x).toBe(340);
    expect(byId(els, "C").points[0].x).toBe(700); // outside: untouched
    await s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await s.press("Control+z");
    await s.waitForIdle();
    expect(byId(await s.elements(), "A").points[0].x).toBe(120); // one undo step for the frame and its contents
    await field("Width").fill("700");
    await field("Width").press("Enter");
    await s.waitForIdle();
    els = await s.elements();
    expect(byId(els, "F").points[1].x - byId(els, "F").points[0].x).toBe(700);
    expect(byId(els, "A").points[0]).toMatchObject({ x: 120, y: 130 });
    expect(byId(els, "B").points[0]).toMatchObject({ x: 340, y: 130 });
  });
});


suite("editor frames: drawing and picking", () => {
  let s: EditorSession | undefined;
  afterEach(async () => {
    if (s) {
      expect(s.problems.filter((p) => !/favicon|404|willReadFrequently/i.test(p))).toEqual([]);
      await s.close();
    }
    s = undefined;
  });

  /** The canvas pixel (r, g, b, a) under a board point. */
  const pixel = async (session: EditorSession, world: Point) => {
    const at = await session.toScreen(world);
    return session.page.evaluate(({ x, y }) => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      const data = canvas.getContext("2d")!.getImageData(Math.round((x - rect.left) * dpr), Math.round((y - rect.top) * dpr), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    }, at);
  };

  it("draws the frame, its header band and the shapes it owns, in light and dark", async () => {
    for (const dark of [false, true]) {
      s = await openEditor({ elements: scene() as never, dark });
      const empty = await pixel(s, { x: 900, y: 650 });
      const header = await pixel(s, { x: 300, y: 76 });
      const body = await pixel(s, { x: 300, y: 380 });
      expect(header).not.toEqual(empty); // the header band is tinted
      expect(body).toEqual(empty); // a frame with no fill leaves its body as the canvas
      expect(await pixel(s, { x: 80, y: 240 })).not.toEqual(empty); // the left border
      await s.screenshot(`frames-${dark ? "dark" : "light"}`);
      await s.close();
      s = undefined;
    }
  });

  it("draws a frame under its contents even when it is stored above them", async () => {
    const stored = scene();
    stored.push(stored.shift()!); // the frame is now after everything it owns
    stored[stored.length - 1] = { ...stored[stored.length - 1], fill: "#e0f2fe" };
    s = await openEditor({ elements: stored as never, dark: false });
    expect(stored.at(-1)!.id).toBe("F");
    const onA = await pixel(s, { x: 180, y: 170 });
    expect(onA.slice(0, 3)).toEqual([0xfd, 0xe6, 0x8a]); // A's fill, not the frame's
    const onFrame = await pixel(s, { x: 300, y: 380 });
    expect(onFrame.slice(0, 3)).toEqual([0xe0, 0xf2, 0xfe]);
  });

  it("picks a frame by its header, border or tab, and the shape under the pointer inside it", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 300, y: 76 }); // header band
    expect(await s.selected()).toEqual(["F"]);
    await s.click({ x: 900, y: 650 });
    await s.click({ x: 80, y: 300 }); // left border
    expect(await s.selected()).toEqual(["F"]);
    await s.click({ x: 900, y: 650 });
    await s.click({ x: 180, y: 170 }); // inside A
    expect(await s.selected()).toEqual(["A"]);
    await s.click({ x: 300, y: 380 }); // empty interior picks nothing
    expect(await s.selected()).toEqual([]);
    await s.click({ x: 90, y: 508 }); // G's tab sits above its box
    expect(await s.selected()).toEqual(["G"]);
    await s.click({ x: 900, y: 650 });
    await s.click({ x: 170, y: 600 }); // inside D
    expect(await s.selected()).toEqual(["D"]);
  });

  it("a rubber band inside a frame picks its contents, not the frame; one around it picks everything", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.drag({ x: 100, y: 110 }, { x: 480, y: 250 }); // overlaps the frame's box, encloses A, B and the connector
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
    await s.click({ x: 900, y: 650 });
    await s.drag({ x: 62, y: 56 }, { x: 640, y: 440 }); // surrounds Billing
    expect(sorted(await s.selected())).toEqual(["A", "B", "F", "ab"]);
  });

  it("hovering a frame shows its box without selecting it", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    const before = await pixel(s, { x: 300, y: 60 });
    const at = await s.toScreen({ x: 300, y: 76 });
    await s.page.mouse.move(at.x, at.y);
    await s.waitForIdle();
    expect(await s.selected()).toEqual([]);
    expect(await pixel(s, { x: 300, y: 60 })).not.toEqual(before);
  });

  it("survives a reload with the frame, its title and its contents intact", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 300, y: 76 });
    await s.press("ArrowRight"); // any edit writes the board
    await s.waitForIdle();
    await s.reload();
    const els = await s.elements();
    expect(byId(els, "F")).toMatchObject({ type: "frame", title: "Billing" });
    expect(byId(els, "A").frameId).toBe("F");
    expect(byId(els, "G").titlePlacement).toBe("above");
  });
});

suite("editor frames: moving, owning and deleting", () => {
  let s: EditorSession | undefined;
  afterEach(async () => {
    if (s) {
      expect(s.problems.filter((p) => !/favicon|404|willReadFrequently/i.test(p))).toEqual([]);
      await s.close();
    }
    s = undefined;
  });

  /** The scene plus a connector from B (inside Billing) to C (outside). */
  const withBoundary = (): El[] => [...scene(), connector("bc", "B", "C", { points: [{ x: 460, y: 170 }, { x: 700, y: 170 }], startConnection: { elementId: "B", anchorId: "B-anchor-right" }, endConnection: { elementId: "C", anchorId: "C-anchor-left" } })];

  it("dragging a frame by its header moves everything it owns, keeps connectors attached, and is one undo step", async () => {
    s = await openEditor({ elements: withBoundary() as never, dark: false });
    const before = await s.elements();
    await s.drag({ x: 300, y: 76 }, { x: 360, y: 116 });
    const after = await s.elements();
    expect(byId(after, "F").points[0]).toEqual({ x: 140, y: 100 });
    expect(byId(after, "A").points[0]).toEqual({ x: 180, y: 170 });
    expect(byId(after, "B").points[0]).toEqual({ x: 400, y: 170 });
    expect(byId(after, "ab").points[0]).toMatchObject({ x: 300, y: 210 }); // travelled with its ends
    expect(byId(after, "C").points[0]).toEqual({ x: 700, y: 130 }); // outside: untouched
    expect(byId(after, "D").points[0]).toEqual({ x: 120, y: 570 }); // another frame: untouched
    const bc = byId(after, "bc");
    expect(bc.points[0]).toMatchObject({ x: 520, y: 210 }); // still leaves B's right side
    expect(bc.points.at(-1)).toMatchObject({ x: 700, y: 170 }); // and still reaches C
    expect(bc.startConnection.elementId).toBe("B");
    expect(await s.selected()).toEqual(["F"]);
    await s.press("Control+z");
    expect(await s.elements()).toEqual(before);
  });

  it("arrow keys nudge a selected frame together with its contents", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 300, y: 76 });
    await s.press("ArrowRight");
    await s.press("ArrowDown");
    const els = await s.elements();
    expect(byId(els, "F").points[0]).toEqual({ x: 81, y: 61 });
    expect(byId(els, "A").points[0]).toEqual({ x: 121, y: 131 });
    expect(byId(els, "D").points[0]).toEqual({ x: 120, y: 570 });
  });

  it("dropping a shape into a frame makes the frame its owner; dragging it out releases it; both are one undo step", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.drag({ x: 760, y: 170 }, { x: 260, y: 330 }); // C into Billing
    expect(byId(await s.elements(), "C").frameId).toBe("F");
    await s.press("Control+z");
    expect(byId(await s.elements(), "C").frameId).toBeUndefined();
    expect(byId(await s.elements(), "C").points[0]).toEqual({ x: 700, y: 130 }); // the move and the owner change undo together
    await s.press("Control+Shift+z");
    await s.drag({ x: 160, y: 150 }, { x: 960, y: 650 }); // A out to empty canvas
    expect(byId(await s.elements(), "A").frameId).toBeUndefined();
    expect(byId(await s.elements(), "B").frameId).toBe("F");
  });

  it("a plain click on a shape does not change who owns it", async () => {
    const stored = scene();
    delete (stored[1] as El).frameId; // A sits inside Billing but was never assigned
    s = await openEditor({ elements: stored as never, dark: false });
    const before = await s.elements();
    await s.click({ x: 180, y: 170 });
    await s.waitForIdle();
    expect(await s.elements()).toEqual(before);
  });

  it("an auto-fit frame follows its contents after a drag", async () => {
    const stored = scene();
    stored[0] = { ...stored[0], autoFit: true, padding: 20, minWidth: 10, minHeight: 10 };
    s = await openEditor({ elements: stored as never, dark: false });
    await s.drag({ x: 400, y: 170 }, { x: 560, y: 170 }); // B moves right by 160
    const f = byId(await s.elements(), "F").points;
    expect(f[1].x).toBeGreaterThan(600); // grew to wrap B plus padding: B's right edge is 620
    expect(Math.round(f[1].x)).toBe(640);
  });

  it("Delete on a selected frame removes it and everything inside, and nothing else", async () => {
    s = await openEditor({ elements: withBoundary() as never, dark: false });
    await s.click({ x: 300, y: 76 });
    await s.press("Delete");
    const left = (await s.elements()).map((e) => e.id).sort();
    expect(left).toEqual(["C", "D", "G"]); // bc went with B
    await s.press("Control+z");
    expect((await s.elements()).map((e) => e.id).sort()).toEqual(["A", "B", "C", "D", "F", "G", "ab", "bc"]);
  });

  it("the eraser passes over a frame without deleting it", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.pickTool("e");
    await s.drag({ x: 200, y: 76 }, { x: 400, y: 76 });
    expect((await s.elements()).some((e) => e.id === "F")).toBe(true);
  });

  it("Ctrl+D duplicates a frame with its contents; the copies belong to the copy", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 300, y: 76 });
    await s.press("Control+d");
    await s.waitForIdle();
    const els = await s.elements();
    const frames = els.filter((e) => e.type === "frame" && e.title === "Billing");
    expect(frames).toHaveLength(2);
    const copy = frames.find((f) => f.id !== "F")!;
    expect(els.filter((e) => e.frameId === copy.id)).toHaveLength(3);
    expect(els.filter((e) => e.frameId === "F")).toHaveLength(3);
  });

  it("the frame tool (O) draws a frame that adopts what it covers, as one undo step, and goes back to select", async () => {
    s = await openEditor({ elements: [rect("A", 120, 130, 120, 80), rect("B", 340, 130, 120, 80), rect("C", 700, 130)] as never, dark: false });
    await s.press("o");
    await s.drag({ x: 80, y: 90 }, { x: 520, y: 300 });
    await s.waitForIdle();
    const els = await s.elements();
    const drawn = els.filter((e) => e.type === "frame");
    expect(drawn).toHaveLength(1);
    expect(byId(els, "A").frameId).toBe(drawn[0].id);
    expect(byId(els, "B").frameId).toBe(drawn[0].id);
    expect(byId(els, "C").frameId).toBeUndefined();
    expect(els.findIndex((e) => e.id === drawn[0].id)).toBeLessThan(els.findIndex((e) => e.id === "A")); // below its contents
    expect(await s.selected()).toEqual([drawn[0].id]);
    await s.press("Control+z");
    expect((await s.elements()).some((e) => e.type === "frame")).toBe(false);
    expect(byId(await s.elements(), "A").frameId).toBeUndefined();
  });

  it("a frame drawn inside another frame is nested in it; a click with the tool draws nothing", async () => {
    s = await openEditor({ elements: [frame("F", 80, 60, 520, 360)] as never, dark: false });
    await s.press("o");
    await s.drag({ x: 140, y: 140 }, { x: 300, y: 260 });
    const inner = (await s.elements()).find((e) => e.type === "frame" && e.id !== "F")!;
    expect(inner.frameId).toBe("F");
    await s.press("o");
    await s.click({ x: 700, y: 500 });
    expect((await s.elements()).filter((e) => e.type === "frame")).toHaveLength(2);
  });

  it("double-clicking the header edits the title in place; Enter keeps it, and it is one undo step", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    const before = await s.elements();
    await s.dblclick({ x: 300, y: 76 });
    const input = s.page.getByLabel("Frame title");
    await input.waitFor();
    expect(await input.inputValue()).toBe("Billing");
    await s.screenshot("frame-title-editing");
    await s.type("Payments");
    await s.press("Enter");
    await s.waitForIdle();
    const after = await s.elements();
    expect(byId(after, "F").title).toBe("Payments");
    expect(after.some((e) => e.type === "text")).toBe(false); // a field of the frame, not a text element
    expect(after).toHaveLength(before.length);
    expect(await input.count()).toBe(0);
    await s.press("Control+z");
    expect(byId(await s.elements(), "F").title).toBe("Billing");
  });

  it("Escape throws the edit away; a selected frame opens its title with Enter; a tab title edits too", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 300, y: 76 });
    await s.press("Enter");
    const input = s.page.getByLabel("Frame title");
    await input.waitFor();
    await s.type("Discarded");
    await s.press("Escape");
    expect(byId(await s.elements(), "F").title).toBe("Billing");
    await s.dblclick({ x: 100, y: 508 }); // the tab above Tab's box
    await input.waitFor();
    await s.type("Renamed");
    await s.press("Enter");
    expect(byId(await s.elements(), "G").title).toBe("Renamed");
  });

  it("clearing the title falls back to the default, and a frame without a header has nothing to edit", async () => {
    const stored = scene();
    stored.push(frame("H", 700, 400, 200, 140, { headerVisible: false }));
    s = await openEditor({ elements: stored as never, dark: false });
    await s.dblclick({ x: 300, y: 76 });
    await s.page.getByLabel("Frame title").waitFor();
    await s.press("Control+a");
    await s.press("Backspace");
    await s.press("Enter");
    expect(byId(await s.elements(), "F").title).toBeUndefined();
    await s.click({ x: 700, y: 470 }); // H's left border
    await s.press("Enter");
    expect(await s.page.getByLabel("Frame title").count()).toBe(0);
  });
});

suite("editor frames: lock and hide", () => {
  let s: EditorSession | undefined;
  afterEach(async () => {
    if (s) {
      expect(s.problems.filter((p) => !/favicon|404|willReadFrequently/i.test(p))).toEqual([]);
      await s.close();
    }
    s = undefined;
  });

  const pixel = async (session: EditorSession, world: Point) => {
    const at = await session.toScreen(world);
    return session.page.evaluate(({ x, y }) => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      const data = canvas.getContext("2d")!.getImageData(Math.round((x - rect.left) * dpr), Math.round((y - rect.top) * dpr), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    }, at);
  };

  it("a locked frame locks its contents: they stay put and survive Delete until it is unlocked", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 300, y: 76 });
    await s.press("Control+Shift+l");
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").locked).toBe(true);
    expect(byId(await s.elements(), "A")).not.toHaveProperty("locked"); // derived, not written to the contents
    const before = await s.elements();
    await s.drag({ x: 180, y: 170 }, { x: 260, y: 300 }); // try to move A
    await s.waitForIdle();
    expect(await s.elements()).toEqual(before);
    await s.click({ x: 180, y: 170 });
    await s.press("Delete");
    await s.waitForIdle();
    expect(byId(await s.elements(), "A")).toBeTruthy();
    await s.click({ x: 300, y: 76 });
    await s.press("Control+Shift+l");
    await s.waitForIdle();
    await s.drag({ x: 180, y: 170 }, { x: 180, y: 300 });
    expect(byId(await s.elements(), "A").points[0].y).toBe(260);
  });

  it("a hidden frame hides its contents and their connectors; Show all brings them back untouched", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    const painted = await pixel(s, { x: 180, y: 170 }); // inside A, amber
    await s.click({ x: 300, y: 76 });
    await s.press("Control+Shift+h");
    await s.waitForIdle();
    expect(byId(await s.elements(), "F").hidden).toBe(true);
    expect(byId(await s.elements(), "A")).not.toHaveProperty("hidden");
    const gone = await pixel(s, { x: 180, y: 170 });
    expect(gone).not.toEqual(painted);
    expect(await s.selected()).toEqual([]);
    await s.click({ x: 180, y: 170 }); // nothing to pick where A was
    expect(await s.selected()).toEqual([]);
    await s.page.getByTestId("hidden-chip").click();
    await s.waitForIdle();
    expect(await pixel(s, { x: 180, y: 170 })).toEqual(painted);
    expect(byId(await s.elements(), "F")).not.toHaveProperty("hidden");
    expect(byId(await s.elements(), "A").frameId).toBe("F");
  });

  it("a frame drawn over a locked frame is drawn beside it, not inside", async () => {
    const stored = scene();
    stored[0] = { ...stored[0], locked: true };
    s = await openEditor({ elements: stored as never, dark: false });
    await s.press("o");
    await s.drag({ x: 150, y: 300 }, { x: 260, y: 380 });
    await s.waitForIdle();
    const made = (await s.elements()).filter((e) => e.type === "frame" && e.id !== "F" && e.id !== "G");
    expect(made).toHaveLength(1);
    expect(made[0].frameId).toBeUndefined();
  });
});


suite("editor frames: commands", () => {
  let s: EditorSession | undefined;
  afterEach(async () => {
    if (s) {
      expect(s.problems.filter((p) => !/favicon|404|willReadFrequently/i.test(p))).toEqual([]);
      await s.close();
    }
    s = undefined;
  });

  const palette = async (session: EditorSession, name: string) => {
    await session.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await session.page.keyboard.press("Control+k");
    await session.page.getByRole("option", { name }).click();
    await session.waitForIdle();
  };
  const contextMenu = async (session: EditorSession, at: Point, name: string) => {
    const screen = await session.toScreen(at);
    await session.page.mouse.click(screen.x, screen.y, { button: "right" });
    await session.page.getByRole("menuitem", { name }).click();
    await session.waitForIdle();
  };

  it("Ctrl+Alt+G frames the selection; one undo step takes the frame away again", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 760, y: 150 }); // C
    await s.page.keyboard.down("Shift");
    await s.click({ x: 160, y: 150 }); // A, inside Billing
    await s.page.keyboard.up("Shift");
    await s.page.keyboard.press("Control+Alt+g");
    await s.waitForIdle();
    const els = await s.elements();
    const added = els.filter((e) => e.type === "frame" && e.id !== "F" && e.id !== "G");
    expect(added).toHaveLength(1);
    expect(byId(els, "C").frameId).toBe(added[0].id);
    expect(byId(els, "A").frameId).toBe(added[0].id);
    expect(await s.selected()).toEqual([added[0].id]);
    await s.press("Control+z");
    expect((await s.elements()).filter((e) => e.type === "frame")).toHaveLength(2);
    expect(byId(await s.elements(), "A").frameId).toBe("F");
  });

  it("the context menu removes a shape from its frame, fits a frame, and removes a frame but keeps its contents", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 160, y: 150 }); // A
    await contextMenu(s, { x: 160, y: 150 }, "Remove from frame");
    expect(byId(await s.elements(), "A").frameId).toBeUndefined();
    expect(byId(await s.elements(), "B").frameId).toBe("F");
    await s.press("Control+z");
    expect(byId(await s.elements(), "A").frameId).toBe("F");

    await s.click({ x: 300, y: 76 });
    await contextMenu(s, { x: 300, y: 76 }, "Fit frame to contents");
    expect(Math.round(byId(await s.elements(), "F").points[1].x)).toBe(460 + 24);

    await s.click({ x: 300, y: 76 });
    await contextMenu(s, { x: 300, y: 76 }, "Remove frame, keep contents");
    const els = await s.elements();
    expect(els.some((e) => e.id === "F")).toBe(false);
    expect(["A", "B", "ab"].every((id) => els.some((e) => e.id === id && e.frameId === undefined))).toBe(true);
    expect((await s.selected()).sort()).toEqual(["A", "B", "ab"]);
  });

  it("the palette runs the same commands, and a command with nothing to do says so instead of changing the board", async () => {
    s = await openEditor({ elements: scene() as never, dark: false });
    await s.click({ x: 760, y: 150 }); // C: loose, in no frame
    const before = await s.elements();
    await palette(s, "Remove from frame");
    expect(await s.elements()).toEqual(before);
    await s.page.getByText("Nothing selected is in a frame.").waitFor();
    await palette(s, "Frame selection");
    expect((await s.elements()).filter((e) => e.type === "frame")).toHaveLength(3);
  });
});

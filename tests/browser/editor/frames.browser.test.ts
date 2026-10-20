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
});

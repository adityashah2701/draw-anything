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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";
import { board, byId, records, sorted, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

suite("editor inspector: precise editing", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never });
  });
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p))).toEqual([]);
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
  /** Leave the field (a text field keeps its own Ctrl+Z, so board shortcuts need focus back on the canvas). */
  const leaveField = () => s.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const groupAB = async () => {
    await s.drag({ x: 60, y: 60 }, { x: 460, y: 220 });
    await s.press("Control+g");
    await s.waitForIdle();
  };

  it("shows the selected shape's position and size", async () => {
    await select("A");
    await expect(field("X").inputValue()).resolves.toBe("100");
    await expect(field("Y").inputValue()).resolves.toBe("100");
    await expect(field("Width").inputValue()).resolves.toBe("120");
    await expect(field("Height").inputValue()).resolves.toBe("80");
  });

  it("typing X and Y moves the shape and the connector follows", async () => {
    await select("A");
    await enter("X", "150");
    await enter("Y", "60");
    const els = await s.elements();
    expect(byId(els, "A").points).toEqual([{ x: 150, y: 60 }, { x: 270, y: 140 }]);
    const arrow = byId(els, "ab");
    expect(arrow.startConnection.elementId).toBe("A");
    expect(arrow.points[0]).toMatchObject({ x: 270, y: 100 }); // A's new right-middle
    expect(arrow.points.at(-1)).toMatchObject({ x: 400, y: 140 }); // still B's left-middle
  });

  it("typing width and height resizes the shape from its top-left corner", async () => {
    await select("A");
    await enter("Width", "200");
    await enter("Height", "50");
    expect(byId(await s.elements(), "A").points).toEqual([{ x: 100, y: 100 }, { x: 300, y: 150 }]);
  });

  it("the proportion lock drives the other dimension", async () => {
    await select("A");
    await s.page.getByRole("button", { name: "Lock proportions" }).click();
    await enter("Width", "240");
    expect(byId(await s.elements(), "A").points).toEqual([{ x: 100, y: 100 }, { x: 340, y: 260 }]); // 120x80 -> 240x160
  });

  it("each edit is one undo step", async () => {
    await select("A");
    const before = await s.elements();
    await enter("Width", "300");
    expect(await s.elements()).not.toEqual(before);
    await leaveField();
    await s.press("Control+z");
    expect(await s.elements()).toEqual(before);
  });

  it("Escape puts the old value back and nothing is written", async () => {
    await select("A");
    const before = await s.elements();
    const f = field("Width");
    await f.fill("999");
    await f.press("Escape");
    await expect(f.inputValue()).resolves.toBe("120");
    expect(await s.elements()).toEqual(before);
  });

  it("text that is not a number changes nothing", async () => {
    await select("A");
    const before = await s.elements();
    await enter("Width", "abc");
    await enter("X", "");
    expect(await s.elements()).toEqual(before);
  });

  it("arrow keys step the value, Shift by ten", async () => {
    await select("A");
    const f = field("X");
    await f.focus();
    await f.press("ArrowUp");
    expect(byId(await s.elements(), "A").points[0].x).toBe(101);
    await f.press("Shift+ArrowDown");
    expect(byId(await s.elements(), "A").points[0].x).toBe(91);
  });

  it("a group is edited as one object: W scales every member, keeping their relative places", async () => {
    await groupAB();
    await expect(field("Width").inputValue()).resolves.toBe("420");
    await expect(field("Height").inputValue()).resolves.toBe("80");
    await enter("Width", "840"); // x2 horizontally
    const els = await s.elements();
    expect(byId(els, "A").points).toEqual([{ x: 100, y: 100 }, { x: 340, y: 180 }]);
    expect(byId(els, "B").points).toEqual([{ x: 700, y: 100 }, { x: 940, y: 180 }]);
    const arrow = byId(els, "ab");
    expect(arrow.points[0]).toMatchObject({ x: 340, y: 140 });
    expect(arrow.points.at(-1)).toMatchObject({ x: 700, y: 140 });
    expect(byId(els, "A").groupId).toBe(records(els)[0].id);
  });

  it("a group can be named, and the name survives undo of other edits", async () => {
    await groupAB();
    const name = s.page.getByRole("textbox", { name: "Group name" });
    await name.fill("Request flow");
    await name.press("Enter");
    expect(records(await s.elements())[0].name).toBe("Request flow");
    await s.waitForIdle();
    const saved = await s.saved();
    expect((saved?.elements as El[] | undefined)?.find((e) => e.type === "group")?.name).toBe("Request flow");
  });

  it("rotation: one shape takes an absolute angle, and clicking follows the turned outline", async () => {
    await select("C"); // 120 x 80 at (250,320): centre (310, 360)
    await enter("Rotation", "90");
    expect(byId(await s.elements(), "C").rotation).toBe(90);
    // After a quarter turn it is 80 wide and 120 tall: (310, 310) is now inside, (255, 360) is outside.
    await s.click({ x: 900, y: 600 });
    await s.click({ x: 310, y: 305 });
    expect(await s.selected()).toEqual(["C"]);
    await s.click({ x: 900, y: 600 });
    await s.click({ x: 256, y: 360 });
    expect(await s.selected()).toEqual([]);
  });

  it("rotating a connected shape reroutes its connector to the moved anchor", async () => {
    await select("A"); // A: (100,100) 120x80, centre (160,140)
    await enter("Rotation", "90");
    const arrow = byId(await s.elements(), "ab");
    expect(arrow.startConnection.elementId).toBe("A");
    // A's "right" anchor is now where its local top was: top-middle after a quarter turn faces right.
    // Whatever side it uses, the connector must still start on A's rotated outline.
    const start = arrow.points[0];
    const onOutline = [
      { x: 160, y: 140 - 60 }, // rotated 'left'  anchor sits at the top
      { x: 160 + 40, y: 140 }, // rotated 'top'   anchor sits to the right
      { x: 160, y: 140 + 60 }, // rotated 'right' anchor sits at the bottom
      { x: 160 - 40, y: 140 }, // rotated 'bottom' anchor sits to the left
    ];
    expect(onOutline.some((p) => Math.hypot(p.x - start.x, p.y - start.y) < 0.5)).toBe(true);
  });

  it("the label editor of a rotated shape is turned with it", async () => {
    await select("C");
    await enter("Rotation", "90");
    await leaveField();
    await s.dblclick({ x: 310, y: 305 });
    await s.page.waitForSelector("[contenteditable]:focus");
    const transform = await s.page.evaluate(() => getComputedStyle(document.querySelector("[contenteditable]:focus")!).transform);
    // matrix(a, b, c, d, e, f) of a quarter turn: a ~ 0, b ~ 1
    const [a, b] = transform.replace("matrix(", "").replace(")", "").split(",").map(Number);
    expect(Math.abs(a)).toBeLessThan(1e-6);
    expect(b).toBeCloseTo(1, 6);
    await s.type("turned");
    await s.press("Escape");
    expect(byId(await s.elements(), "C").label).toBe("turned");
  });

  it("rotation is saved and survives a reload; angle 0 removes the field again", async () => {
    await select("C");
    await enter("Rotation", "30");
    await s.waitForIdle();
    await s.reload();
    expect(byId(await s.elements(), "C").rotation).toBe(30);
    await select("C");
    await enter("Rotation", "0");
    expect("rotation" in byId(await s.elements(), "C")).toBe(false);
  });

  it("rotating a group turns every member about the group's centre, as one rigid body", async () => {
    await groupAB(); // A(100..220) B(400..520), y 100..180: centre (310, 140)
    await s.page.getByRole("button", { name: "Rotate 90° clockwise" }).click();
    const els = await s.elements();
    const a = byId(els, "A");
    const b = byId(els, "B");
    expect(a.rotation).toBe(90);
    expect(b.rotation).toBe(90);
    // A's centre (160,140) -> (310,140) + R90(-150,0) = (310, -10); B's -> (310, 290)
    const centre = (e: El) => ({ x: (e.points[0].x + e.points[1].x) / 2, y: (e.points[0].y + e.points[1].y) / 2 });
    expect(centre(a).x).toBeCloseTo(310, 4);
    expect(centre(a).y).toBeCloseTo(-10, 4);
    expect(centre(b).y).toBeCloseTo(290, 4);
    // the connector turned with them (still joins A and B, and is a single rigid copy)
    const arrow = byId(els, "ab");
    expect(arrow.startConnection.elementId).toBe("A");
    expect(arrow.points[0].x).toBeCloseTo(310, 4);
    expect(arrow.points[0].y).toBeCloseTo(50, 4);
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
  });

  it("multi-selection: stroke width applies to every selected shape in one undo step", async () => {
    await select("A", "C");
    const before = await s.elements();
    await enter("Stroke width", "6");
    const els = await s.elements();
    expect(byId(els, "A").strokeWidth).toBe(6);
    expect(byId(els, "C").strokeWidth).toBe(6);
    expect(byId(els, "B").strokeWidth).toBe(2);
    await leaveField();
    await s.press("Control+z");
    expect(await s.elements()).toEqual(before);
  });

  it("mixed values are shown as mixed, and typing one applies it to all", async () => {
    await select("A");
    await enter("Stroke width", "4");
    await select("A", "C");
    await expect(field("Stroke width").inputValue()).resolves.toBe("");
    await expect(field("Stroke width").getAttribute("placeholder")).resolves.toBe("Mixed");
    await enter("Stroke width", "3");
    const els = await s.elements();
    expect([byId(els, "A").strokeWidth, byId(els, "C").strokeWidth]).toEqual([3, 3]);
  });

  it("a locked selection shows its numbers but cannot be edited", async () => {
    await select("C");
    await s.press("Control+Shift+l");
    await expect(field("X").inputValue()).resolves.toBe("250");
    await expect(field("X").isDisabled()).resolves.toBe(true);
    await expect(field("Width").isDisabled()).resolves.toBe(true);
  });

  it("in a mixed selection only the unlocked shapes are edited", async () => {
    await select("C");
    await s.press("Control+Shift+l");
    await select("A", "C");
    await enter("X", "10");
    const els = await s.elements();
    expect(byId(els, "A").points[0].x).toBe(10);
    expect(byId(els, "C").points[0].x).toBe(250); // locked: untouched
  });

  it("looks right (screenshot for review)", async () => {
    await groupAB();
    await s.waitForIdle();
    await s.screenshot("inspector-group");
    expect(await s.page.getByTestId("selection-inspector").isVisible()).toBe(true);
  });
});
